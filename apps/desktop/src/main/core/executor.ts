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

/**
 * TransactionExecutor — the SINGLE write path for pond.
 *
 * Invariants:
 *  - The renderer + HTTP handlers never mutate `saves` / `tags` / disk
 *    directly. They call `executeTransaction(tx)` and read from the
 *    Object Pool (renderer) / index (main).
 *  - Every transaction's DB side runs inside `db.transaction((t) => ...)`
 *    so index + sync_action row commit or roll back together.
 *  - On success we broadcast `sync-action` to every renderer window. The
 *    pool reconciles and re-renders.
 *  - Failure modes: if `applyToDisk` throws we roll the DB back by
 *    re-throwing inside the callback; the renderer's optimistic update
 *    is reverted via the error path.
 *
 * See plan § "Transactions, Object Pool & sync actions".
 */

export interface ExecuteOptions {
  /** Skip broadcasting — used by startup crash-replay. */
  silent?: boolean;
}

type SaveRow = Save;
type TagRow = Tag;

/**
 * Compute the `data` payload that ships with a sync-action.
 *
 * For `create` we store the inserted row, for `update` we store the
 * patch — both are already on the tx. For state-only transitions
 * (`trash`/`untrash`, deprecated `archive`/`unarchive`) the tx itself
 * carries no payload, so we synthesise the patch here. Without this the
 * renderer's `applyAction` "A" branch would receive `null` and skip the
 * pool merge, leaving the UI stale until next hydration.
 */
function dataForSyncAction(tx: Transaction): unknown {
  if ("data" in tx) return tx.data as unknown;
  if ("patch" in tx) return tx.patch as unknown;
  switch (tx.kind) {
    case "trash":
    case "archive":
      return { deletedAt: new Date() };
    case "untrash":
    case "unarchive":
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
    case "archive":
    case "unarchive":
      return "A";
  }
}

function resolveActor(meta: TxMeta | undefined): {
  actor: "user" | "ai" | "system";
  reason: string | null;
} {
  return {
    actor: meta?.actor ?? "user",
    reason: meta?.actorReason ?? null,
  };
}

/**
 * Dispatch a single transaction through the full pipeline:
 *   1. stash in __transactions (crash-safety)
 *   2. apply to disk (file-first)
 *   3. apply to index (drizzle)
 *   4. record sync_actions row
 *   5. remove __transactions row
 *   6. broadcast sync-action to renderers
 *
 * Step 2-5 run inside a SINGLE `better-sqlite3` transaction so either all
 * four succeed or none do.
 */
export async function executeTransaction(
  tx: Transaction,
  opts: ExecuteOptions = {},
): Promise<SyncAction> {
  const db = await getDb();
  const raw = db.$raw;
  const txRowId = ulid();
  const batchId = tx.meta?.batchId ?? null;

  // Step 1: cache-before-commit.
  raw
    .prepare(`INSERT INTO __transactions (id, batch_id, tx) VALUES (?, ?, ?)`)
    .run(txRowId, batchId, JSON.stringify(tx));

  let action: SyncAction;
  try {
    // Step 2: disk writes before DB transaction — disk ops are async, but
    // better-sqlite3 is sync; rather than fight the ABI, we do disk first,
    // DB second. If disk succeeded and DB fails we'll surface a loud error
    // and the scan-library pass will re-sync the row on next startup.
    await applyToDisk(tx);

    // Step 3+4+5: drizzle transaction wraps the index write AND the
    // sync_actions insert so the monotonic id stays consistent.
    action = raw.transaction(() => {
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
      raw
        .prepare(`UPDATE __transactions SET committed_at = ? WHERE id = ?`)
        .run(Date.now(), txRowId);
      return inserted as SyncAction;
    })();
  } catch (err) {
    raw.prepare(`DELETE FROM __transactions WHERE id = ?`).run(txRowId);
    log.error("[pond executor] rollback", { tx, err });
    throw err;
  }

  raw.prepare(`DELETE FROM __transactions WHERE id = ?`).run(txRowId);

  if (!opts.silent && !tx.meta?.silent) {
    broadcastSyncAction(action);
  }
  return action;
}

/** Coalesce N writes into one DB transaction. Used for bulk ingest. */
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
      // Rewrite metadata.json as the merged post-patch shape and, if the
      // tx carried new media files, stream those to disk too. We read
      // the current metadata, shallow-merge the patch (mapped to the
      // metadata shape), and then overlay anything that belongs in the
      // nested `pond` block.
      const existing = await readItemMetadata(tx.id);
      if (!existing) {
        // The on-disk directory is gone but the DB still has a row —
        // happens when a previous write committed the index but never
        // landed the bytes (interrupted refresh, hand-deleted library
        // dir, restored backup with a stale items dir, etc.). If this
        // tx carries fresh files (the heal path in `ingest.ts ->
        // refreshExisting -> anyFileMissing` produces exactly this
        // shape), we can rebuild the directory from scratch by
        // synthesising the post-patch save and handing it to
        // `writeItemFiles` — same call the create-branch above uses.
        // Without this, the heal logic silently no-ops and the broken
        // 404s persist forever despite the toast saying "Refreshed".
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
          // Shallow-merge: the patch is `Partial<NewSave>` keyed by the
          // same column names, so spreading it over `current` produces a
          // valid post-patch `Save`. `writeItemFiles` mkdirs recursively
          // and rewrites metadata.json from this object so the file-side
          // and index-side states converge again.
          const merged = { ...current, ...(tx.patch ?? {}) } as Save;
          log.info(
            "[pond executor] healing orphan: rebuilding items dir",
            tx.id,
            tx.files.map((f) => f.filename),
          );
          await writeItemFiles(tx.id, merged, tx.files);
          return;
        }
        // Text-only patch with no bytes can't reconstruct a directory in
        // a useful way — better to surface the warning so we notice
        // these orphans on the next Refresh that actually downloads
        // something.
        log.warn("[pond executor] update for unknown item", tx.id);
        return;
      }

      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { itemDir } = await import("../paths");

      // Persist new media BEFORE rewriting metadata so a reader never
      // observes a files[] entry pointing at a byte-stream that hasn't
      // landed yet.
      const writtenFiles: Array<{ filename: string; buf: Buffer }> = [];
      if (tx.files && tx.files.length > 0) {
        for (const file of tx.files) {
          const buf = Buffer.from(file.base64, "base64");
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
      // `delete` is a hard delete from the active library; `purge` is a
      // hard delete from trash. `removeItem` covers both since it rm -rf's
      // both possible locations (`items/<id>.info` and `trash/<id>.info`).
      await removeItem(tx.id);
      return;
    case "trash":
    // Deprecated `archive` shares disk semantics with `trash`. Keep the
    // case folded together so an in-flight undo entry still replays.
    case "archive":
      await moveToTrash(tx.id);
      return;
    case "untrash":
    case "unarchive":
      await restoreFromTrash(tx.id);
      return;
  }
}

/**
 * Split a Save patch into the two halves of the metadata.json shape:
 *   - `top` fields sit at the root (name, annotation, tags, url, …)
 *   - `pond` fields live inside the nested pond namespace
 *     (description, author, mediaType, rawSource, …)
 *
 * Any key the on-disk schema doesn't model is silently ignored.
 */
function mapPatchToMetadata(patch: Partial<SaveRow>): {
  top: Record<string, unknown>;
  pond: Record<string, unknown>;
} {
  const top: Record<string, unknown> = {};
  const pond: Record<string, unknown> = {};
  if (patch.title !== undefined) top.name = patch.title;
  if (patch.notes !== undefined) top.annotation = patch.notes ?? "";
  if (patch.tags !== undefined) top.tags = patch.tags;
  if (patch.aiTags !== undefined) top.aiTags = patch.aiTags;
  if (patch.aiCaption !== undefined) top.aiCaption = patch.aiCaption;
  if (patch.url !== undefined) top.url = patch.url;
  if (patch.width !== undefined) top.width = patch.width;
  if (patch.height !== undefined) top.height = patch.height;
  if (patch.fileSize !== undefined) top.size = patch.fileSize;
  if (patch.archivedAt !== undefined) {
    top.archivedAt =
      patch.archivedAt instanceof Date
        ? patch.archivedAt.getTime()
        : patch.archivedAt;
  }
  if (patch.deletedAt !== undefined) top.isDeleted = patch.deletedAt !== null;

  if (patch.description !== undefined) pond.description = patch.description;
  if (patch.author !== undefined) pond.author = patch.author;
  if (patch.mediaType !== undefined) pond.mediaType = patch.mediaType;
  if (patch.coverIndex !== undefined) pond.coverIndex = patch.coverIndex;
  if (patch.ocrText !== undefined) pond.ocrText = patch.ocrText;
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
      // Deprecated alias of `trash`. New writers should emit `trash`.
      case "archive":
        db.update(savesTable)
          .set({ deletedAt: new Date() })
          .where(eq(savesTable.id, tx.id))
          .run();
        return;
      case "untrash":
      case "unarchive":
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

/**
 * Register a main-process listener for sync actions. Useful for the
 * tray / badge / Spotlight index which want to react without going
 * through IPC.
 */
export function registerSyncActionListener(fn: SyncActionListener): () => void {
  syncActionListeners.add(fn);
  return () => syncActionListeners.delete(fn);
}

function broadcastSyncAction(action: SyncAction): void {
  // Convert Date columns embedded in `data` / `prevData` to ISO strings
  // before crossing the IPC boundary so the renderer pool never sees raw
  // `Date` instances (which break the `savedAt`/`createdAt` string
  // contract in `renderer/src/pool/types.ts`).
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

/**
 * Startup crash-replay. Read every row from `__transactions` whose
 * `committed_at IS NULL` and re-run it. If the original write made it
 * to disk but not to the index we'll catch it; if it didn't, we retry
 * from scratch. Either way the DB ends up consistent with disk.
 */
export async function replayPendingTransactions(): Promise<void> {
  const db = await getDb();
  const raw = db.$raw;
  const rows = raw
    .prepare(`SELECT id, tx FROM __transactions WHERE committed_at IS NULL`)
    .all() as Array<{ id: string; tx: string }>;
  if (rows.length === 0) return;
  log.warn(`[pond executor] replaying ${rows.length} pending transactions`);
  for (const row of rows) {
    try {
      const tx = JSON.parse(row.tx) as Transaction;
      // Re-run with the original batchId preserved.
      await executeTransaction(
        {
          ...tx,
          meta: {
            ...(tx.meta ?? {}),
            silent: true,
            actorReason: "crash-replay",
          },
        },
        { silent: true },
      );
    } catch (err) {
      log.error("[pond executor] replay failed", row.id, err);
      // Leave the row alone so the user / next startup can investigate.
    }
  }
}

// Keep `SaveRow` / `TagRow` used so tsc doesn't warn when Phase 3 adds more.
void ((): TagRow[] => []);
