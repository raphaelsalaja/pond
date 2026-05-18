import type { Save, SyncAction, Tag } from "@pond/schema/db";
import {
  saves as savesTable,
  syncActions as syncActionsTable,
  tags as tagsTable,
} from "@pond/schema/db";
import type { Transaction, TxMeta } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { IPC } from "../../shared/constants";
import { getDb } from "../db";
import { toWireSyncAction } from "../ipc/wire";
import {
  inferKindFromFilename,
  moveToTrash,
  readItemMetadata,
  removeItem,
  restoreFromTrash,
  writeItemFiles,
} from "../lib/library";

export interface ExecuteOptions {
  silent?: boolean;
}

type SaveRow = Save;
type TagRow = Tag;

function dataForSyncAction(tx: Transaction): unknown {
  if ("data" in tx) return tx.data as unknown;
  if ("patch" in tx) return tx.patch as unknown;
  switch (tx.kind) {
    case "trash":
      return { deletedAt: new Date() };
    case "untrash":
      return { deletedAt: null };
    default:
      return null;
  }
}

function toActionKind(tx: Transaction): "I" | "U" | "D" | "A" {
  switch (tx.kind) {
    case "create":
      return "I";
    case "update":
      return "U";
    case "delete":
    case "purge":
      return "D";
    case "trash":
    case "untrash":
      return "A";
  }
}

function resolveActor(meta: TxMeta | undefined): {
  actor: "user" | "system";
  reason: string | null;
} {
  return {
    actor: meta?.actor ?? "user",
    reason: meta?.actorReason ?? null,
  };
}

const SYNC_ACTIONS_RING = 5000;
let writesSinceTrim = 0;

export async function executeTransaction(
  tx: Transaction,
  opts: ExecuteOptions = {},
): Promise<SyncAction> {
  const db = await getDb();
  const raw = db.$raw;
  const batchId = tx.meta?.batchId ?? null;

  await applyToDisk(tx);

  const action = raw.transaction(() => {
    applyToIndex(db, tx);
    const inserted = db
      .insert(syncActionsTable)
      .values({
        batchId,
        modelName: tx.model,
        modelId: tx.id,
        action: toActionKind(tx),
        data: dataForSyncAction(tx),
        prevData: "before" in tx ? (tx.before as unknown) : null,
        actor: resolveActor(tx.meta).actor,
        actorReason: resolveActor(tx.meta).reason,
      })
      .returning()
      .all()[0];
    if (!inserted) throw new Error("sync_actions insert returned no row");
    return inserted as SyncAction;
  })();

  writesSinceTrim += 1;
  if (writesSinceTrim >= 500) {
    writesSinceTrim = 0;
    try {
      raw
        .prepare(
          `DELETE FROM sync_actions WHERE id <= (
             SELECT id FROM sync_actions ORDER BY id DESC LIMIT 1 OFFSET ?
           )`,
        )
        .run(SYNC_ACTIONS_RING);
    } catch (err) {
      log.warn("[pond executor] sync_actions trim failed", err);
    }
  }

  if (!opts.silent && !tx.meta?.silent) {
    broadcastSyncAction(action);
  }
  return action;
}

export async function executeBatch(
  txs: Transaction[],
  opts: ExecuteOptions = {},
): Promise<SyncAction[]> {
  const batchId = ulid();
  const results: SyncAction[] = [];
  for (const tx of txs) {
    const withBatch = {
      ...tx,
      meta: { ...(tx.meta ?? {}), batchId },
    } as Transaction;
    results.push(await executeTransaction(withBatch, opts));
  }
  return results;
}

async function applyToDisk(tx: Transaction): Promise<void> {
  if (tx.model !== "save") return;
  switch (tx.kind) {
    case "create": {
      await writeItemFiles(tx.id, tx.data as Save, tx.files ?? []);
      return;
    }
    case "update": {
      const existing = await readItemMetadata(tx.id);
      if (!existing) {
        if (tx.files && tx.files.length > 0) {
          const db = await getDb();
          const rows = await db
            .select()
            .from(savesTable)
            .where(eq(savesTable.id, tx.id));
          const current = rows[0];
          if (!current) {
            log.warn(
              "[pond executor] update for unknown item (no DB row either)",
              tx.id,
            );
            return;
          }
          const merged = { ...current, ...(tx.patch ?? {}) } as Save;
          log.info(
            "[pond executor] healing orphan: rebuilding items dir",
            tx.id,
            tx.files.map((f) => f.filename),
          );
          await writeItemFiles(tx.id, merged, tx.files);
          return;
        }
        log.warn("[pond executor] update for unknown item", tx.id);
        return;
      }

      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { itemDir } = await import("../paths");

      const writtenFiles: Array<{ filename: string; buf: Buffer }> = [];
      if (tx.files && tx.files.length > 0) {
        for (const file of tx.files) {
          const buf = Buffer.isBuffer(file.bytes)
            ? file.bytes
            : Buffer.from(file.bytes);
          await writeFile(join(itemDir(tx.id), file.filename), buf);
          writtenFiles.push({ filename: file.filename, buf });
        }
      }

      const patched = mapPatchToMetadata(tx.patch);
      const merged: typeof existing = {
        ...existing,
        ...patched.top,
        pond: { ...existing.pond, ...patched.pond },
        mtime: Date.now(),
      };

      if (writtenFiles.length > 0) {
        const { createHash } = await import("node:crypto");
        merged.files = writtenFiles.map((f) => ({
          kind: inferKindFromFilename(f.filename),
          path: f.filename,
          sha256: createHash("sha256").update(f.buf).digest("hex"),
          size: f.buf.length,
        }));
      }

      await writeFile(
        join(itemDir(tx.id), "metadata.json"),
        JSON.stringify(merged, null, 2),
      );
      return;
    }
    case "delete":
    case "purge":
      await removeItem(tx.id);
      return;
    case "trash":
      await moveToTrash(tx.id);
      return;
    case "untrash":
      await restoreFromTrash(tx.id);
      return;
  }
}

function mapPatchToMetadata(patch: Partial<SaveRow>): {
  top: Record<string, unknown>;
  pond: Record<string, unknown>;
} {
  const top: Record<string, unknown> = {};
  const pond: Record<string, unknown> = {};
  if (patch.title !== undefined) top.name = patch.title;
  if (patch.notes !== undefined) top.annotation = patch.notes ?? "";
  if (patch.tags !== undefined) top.tags = patch.tags;
  if (patch.url !== undefined) top.url = patch.url;
  if (patch.width !== undefined) top.width = patch.width;
  if (patch.height !== undefined) top.height = patch.height;
  if (patch.fileSize !== undefined) top.size = patch.fileSize;
  if (patch.deletedAt !== undefined) top.isDeleted = patch.deletedAt !== null;

  if (patch.description !== undefined) pond.description = patch.description;
  if (patch.author !== undefined) pond.author = patch.author;
  if (patch.mediaType !== undefined) pond.mediaType = patch.mediaType;
  if (patch.coverIndex !== undefined) pond.coverIndex = patch.coverIndex;
  if (patch.rawJson !== undefined) pond.rawSource = patch.rawJson;

  return { top, pond };
}

function applyToIndex(
  db: Awaited<ReturnType<typeof getDb>>,
  tx: Transaction,
): void {
  if (tx.model === "save") {
    switch (tx.kind) {
      case "create":
        db.insert(savesTable)
          .values(tx.data)
          .onConflictDoUpdate({
            target: [savesTable.source, savesTable.sourceId],
            set: tx.data,
          })
          .run();
        return;
      case "update":
        db.update(savesTable)
          .set(tx.patch)
          .where(eq(savesTable.id, tx.id))
          .run();
        return;
      case "delete":
      case "purge":
        db.delete(savesTable).where(eq(savesTable.id, tx.id)).run();
        return;
      case "trash":
        db.update(savesTable)
          .set({ deletedAt: new Date() })
          .where(eq(savesTable.id, tx.id))
          .run();
        return;
      case "untrash":
        db.update(savesTable)
          .set({ deletedAt: null })
          .where(eq(savesTable.id, tx.id))
          .run();
        return;
    }
  }
  if (tx.model === "tag") {
    switch (tx.kind) {
      case "create":
        db.insert(tagsTable).values(tx.data).onConflictDoNothing().run();
        return;
      case "update":
        db.update(tagsTable).set(tx.patch).where(eq(tagsTable.id, tx.id)).run();
        return;
      case "delete":
        db.delete(tagsTable).where(eq(tagsTable.id, tx.id)).run();
        return;
    }
  }
}

type SyncActionListener = (action: SyncAction) => void;
const syncActionListeners = new Set<SyncActionListener>();

export function registerSyncActionListener(fn: SyncActionListener): () => void {
  syncActionListeners.add(fn);
  return () => syncActionListeners.delete(fn);
}

export function broadcastSyncAction(action: SyncAction): void {
  const wire = toWireSyncAction(action);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.syncAction, wire);
    }
  }
  for (const fn of syncActionListeners) {
    try {
      fn(action);
    } catch (err) {
      log.warn("[pond executor] sync listener threw", err);
    }
  }
}

void ((): TagRow[] => []);
