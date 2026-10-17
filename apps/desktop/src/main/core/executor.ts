import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { NewSave, Save, SyncAction, Tag } from "@pond/schema/db";
import {
  folders as foldersTable,
  savedViews as savedViewsTable,
  saveFolders as saveFoldersTable,
  saves as savesTable,
  syncActions as syncActionsTable,
  tagGroupMembers as tagGroupMembersTable,
  tagGroups as tagGroupsTable,
  tags as tagsTable,
} from "@pond/schema/db";
import type { SyncActionPayload, Transaction, TxMeta } from "@pond/schema/tx";
import { and, eq } from "drizzle-orm";
import { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { IPC } from "../../shared/constants";
import { getDb } from "../db";
import { toWireSyncAction } from "../ipc/wire";
import {
  patchSaveFiles,
  removeSave,
  setSaveDeleted,
  writeSaveFiles,
} from "../lib/library";
import { isSamePath } from "../lib/path-identity";
import { withRawSlim } from "../lib/raw-slim";
import { renameWithRetry } from "../lib/rename-retry";
import { libraryRoot, saveDir } from "../paths";
import { BatchRecoveryError, runRecoverableBatch } from "./batch-journal";
import {
  replaceFolderMemberships,
  writeFolderMemberships,
} from "./folder-transaction";
import { createMutationQueue } from "./mutation-queue";
import { writeOrganizationBundle } from "./organization-bundle";
import { isTagModel, scheduleTagsDump } from "./tags-bundle";
import { setUserTitleLock } from "./user-metadata";

interface ExecuteOptions {
  silent?: boolean;
}

type TagRow = Tag;

function dataForSyncAction(tx: Transaction): SyncActionPayload {
  if ("data" in tx) return tx.data;
  if ("patch" in tx) return tx.patch;
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

function resolveActor(meta: TxMeta | undefined) {
  return {
    actor: meta?.actor ?? "user",
    reason: meta?.actorReason ?? null,
  };
}

const SYNC_ACTIONS_RING = 5000;
/** Queued Saves exist in SQLite before workers materialize their info directory. */
function canPersistBeforeMaterialization(patch: Partial<NewSave>): boolean {
  const {
    createdAt: _createdAt,
    listKinds: _listKinds,
    notes: _notes,
    savedAt: _savedAt,
    tags: _tags,
    ...materializedFields
  } = patch;
  return Object.keys(materializedFields).length === 0;
}
let writesSinceTrim = 0;

const mutationQueue = createMutationQueue();
const blockedLibraries = new Map<string, Error>();
export function withMutationScope<T>(operation: () => Promise<T>): Promise<T> {
  return mutationQueue.run(async () => {
    const blocked = blockedLibraries.get(libraryRoot());
    if (blocked) throw blocked;
    return operation();
  });
}
export async function suspendMutations(): Promise<void> {
  await mutationQueue.suspend();
}

export function resumeMutations(): void {
  mutationQueue.resume();
}

export async function executeTransaction(
  tx: Transaction,
  opts: ExecuteOptions = {},
): Promise<SyncAction> {
  const [action] = await executeBatch([tx], opts);
  if (!action) throw new Error("The transaction produced no sync action.");
  return action;
}

export function executeBatch(
  txs: Transaction[],
  opts: ExecuteOptions = {},
): Promise<SyncAction[]> {
  return withMutationScope(() => executeSerializedBatch(txs, opts));
}

async function executeSerializedBatch(
  txs: Transaction[],
  opts: ExecuteOptions = {},
): Promise<SyncAction[]> {
  if (txs.length === 0) return [];
  const root = libraryRoot();
  const blocked = blockedLibraries.get(root);
  if (blocked) throw blocked;
  const batchId = ulid();
  const db = await getDb();
  const raw = db.$raw;

  const withBatch = txs.map((tx) => ({
    ...tx,
    meta: { ...tx.meta, batchId },
  }));

  const actions = await runRecoverableBatch({
    root,
    batchId,
    transactions: withBatch,
    async applyDisk(transaction) {
      if (libraryRoot() !== root)
        throw new Error("The active library changed during a write.");
      await applyToDisk(transaction);
    },
    afterCleanup: () => {
      raw
        .prepare("DELETE FROM mutation_commits WHERE batch_id = ?")
        .run(batchId);
    },
    onCleanupError: (error) =>
      log.warn("[pond executor] journal cleanup deferred", error),
    commitIndex: () =>
      raw.transaction(() => {
        const out: SyncAction[] = [];
        for (const tx of withBatch) {
          applyToIndex(db, tx);
          const inserted = db
            .insert(syncActionsTable)
            .values({
              batchId,
              modelName: tx.model,
              modelId: tx.id,
              action: toActionKind(tx),
              data: dataForSyncAction(tx),
              prevData: "before" in tx ? tx.before : null,
              actor: resolveActor(tx.meta).actor,
              actorReason: resolveActor(tx.meta).reason,
            })
            .returning()
            .all()[0];
          if (!inserted) throw new Error("sync_actions insert returned no row");
          out.push(inserted);
        }
        if (
          withBatch.some(
            (tx) => tx.model === "folder" || tx.model === "saved_view",
          )
        )
          writeOrganizationBundle(db, libraryRoot());
        raw
          .prepare("INSERT INTO mutation_commits (batch_id) VALUES (?)")
          .run(batchId);
        return out;
      })(),
  }).catch((error) => {
    if (error instanceof BatchRecoveryError) blockedLibraries.set(root, error);
    throw error;
  });

  if (withBatch.some((tx) => isTagModel(tx.model))) scheduleTagsDump();

  writesSinceTrim += actions.length;
  if (writesSinceTrim >= 500) {
    writesSinceTrim = 0;
    try {
      raw
        .prepare(
          `DELETE FROM sync_actions WHERE actor != 'agent' AND id <= (
             SELECT id FROM sync_actions WHERE actor != 'agent' ORDER BY id DESC LIMIT 1 OFFSET ?
           )`,
        )
        .run(SYNC_ACTIONS_RING);
    } catch (err) {
      log.warn("[pond executor] sync_actions trim failed", err);
    }
  }

  if (!opts.silent) {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      if (action && !withBatch[i]?.meta?.silent) broadcastSyncAction(action);
    }
  }
  return actions;
}

async function applyToDisk(tx: Transaction): Promise<void> {
  if (tx.model === "save_folder") {
    await writeFolderMemberships(tx.id, tx.patch.folderIds);
    return;
  }
  if (tx.model !== "save") return;
  switch (tx.kind) {
    case "create": {
      /** SAFETY: a create carries the full row; `NewSave` differs only in DB-defaulted columns `writeSaveFiles` never reads. */
      await writeSaveFiles(tx.id, tx.data as Save, tx.files ?? []);
      return;
    }
    case "update": {
      for (const file of tx.fileRenames ?? []) {
        const source = joinSaveFile(tx.id, file.from);
        const destination = joinSaveFile(tx.id, file.to);
        const destinationExists = await lstat(destination).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            )
              return false;
            throw error;
          },
        );
        const caseOnlyRename =
          process.platform === "win32" && isSamePath(source, destination);
        if (destinationExists && !caseOnlyRename)
          throw new Error(`A file named ${file.to} already exists.`);
        await renameWithRetry(source, destination);
      }
      /** SAFETY: `Partial<NewSave>` and `Partial<Save>` differ only in timestamp nullability, which `patchSaveFiles` writes back unchanged. */
      const patched = await patchSaveFiles(
        tx.id,
        (tx.patch ?? {}) as Partial<Save>,
        tx.files ?? [],
      );
      if (patched) {
        if (tx.titleLock) setUserTitleLock(tx.id, tx.titleLock.after);
        return;
      }

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
        throw new Error("The Save no longer exists.");
      }

      if (
        current.status === "ingesting" &&
        current.files.length === 0 &&
        canPersistBeforeMaterialization(tx.patch)
      ) {
        return;
      }

      if (tx.files && tx.files.length > 0) {
        /** SAFETY: `current` is a full row from the DB; the patch only narrows its columns. */
        const merged = { ...current, ...tx.patch } as Save;
        log.info(
          "[pond executor] healing orphan: rebuilding items dir",
          tx.id,
          tx.files.map((f) => f.filename),
        );
        await writeSaveFiles(tx.id, merged, tx.files);
        if (tx.titleLock) setUserTitleLock(tx.id, tx.titleLock.after);
        return;
      }
      throw new Error(
        `Save metadata could not be read for ${tx.id}. Restore its metadata before editing.`,
      );
    }
    case "delete":
    case "purge":
      await removeSave(tx.id);
      return;
    case "trash":
      await setSaveDeleted(tx.id, new Date());
      return;
    case "untrash":
      await setSaveDeleted(tx.id, null);
      return;
  }
}

function joinSaveFile(id: string, filename: string): string {
  if (
    !filename ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename === "." ||
    filename === ".."
  )
    throw new Error("Invalid Save filename.");
  return join(saveDir(id), filename);
}

function applyToIndex(
  db: Awaited<ReturnType<typeof getDb>>,
  tx: Transaction,
): void {
  if (tx.model === "save_folder") {
    const current = db
      .select({ folderId: saveFoldersTable.folderId })
      .from(saveFoldersTable)
      .where(eq(saveFoldersTable.saveId, tx.id))
      .all()
      .map((row) => row.folderId)
      .sort();
    if (
      JSON.stringify(current) !==
      JSON.stringify([...new Set(tx.before.folderIds)].sort())
    )
      throw new Error("Folder membership changed. Review the operation again.");
    replaceFolderMemberships(db, tx.id, tx.patch.folderIds);
    return;
  }
  if (tx.model === "save") {
    switch (tx.kind) {
      case "create": {
        const values = withRawSlim(tx.data);
        db.insert(savesTable)
          .values(values)
          .onConflictDoUpdate({
            target: [savesTable.source, savesTable.sourceId],
            set: values,
          })
          .run();
        return;
      }
      case "update": {
        const current = db
          .select()
          .from(savesTable)
          .where(eq(savesTable.id, tx.id))
          .get();
        if (!current) throw new Error("The Save no longer exists.");
        const entries = Object.entries(current);
        for (const [key, expected] of Object.entries(tx.before)) {
          if (expected === undefined) continue;
          const actual = entries.find(([field]) => field === key)?.[1];
          if (JSON.stringify(actual) !== JSON.stringify(expected))
            throw new Error("The Save changed. Review the operation again.");
        }
        db.update(savesTable)
          .set(withRawSlim(tx.patch))
          .where(eq(savesTable.id, tx.id))
          .run();
        return;
      }
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
  if (tx.model === "tag_group") {
    switch (tx.kind) {
      case "create":
        db.insert(tagGroupsTable).values(tx.data).onConflictDoNothing().run();
        return;
      case "update":
        db.update(tagGroupsTable)
          .set(tx.patch)
          .where(eq(tagGroupsTable.id, tx.id))
          .run();
        return;
      case "delete":
        db.delete(tagGroupsTable).where(eq(tagGroupsTable.id, tx.id)).run();
        return;
    }
  }
  if (tx.model === "tag_group_member") {
    switch (tx.kind) {
      case "create":
        db.insert(tagGroupMembersTable)
          .values(tx.data)
          .onConflictDoNothing()
          .run();
        return;
      case "delete":
        db.delete(tagGroupMembersTable)
          .where(
            and(
              eq(tagGroupMembersTable.tagId, tx.before.tagId),
              eq(tagGroupMembersTable.groupId, tx.before.groupId),
            ),
          )
          .run();
        return;
    }
  }
  if (tx.model === "saved_view") {
    switch (tx.kind) {
      case "create":
        db.insert(savedViewsTable).values(tx.data).onConflictDoNothing().run();
        return;
      case "update":
        db.update(savedViewsTable)
          .set(tx.patch)
          .where(eq(savedViewsTable.id, tx.id))
          .run();
        return;
      case "delete":
        db.delete(savedViewsTable).where(eq(savedViewsTable.id, tx.id)).run();
        return;
    }
  }
  if (tx.model === "folder") {
    switch (tx.kind) {
      case "create":
        db.insert(foldersTable).values(tx.data).onConflictDoNothing().run();
        return;
      case "update":
        db.update(foldersTable)
          .set(tx.patch)
          .where(eq(foldersTable.id, tx.id))
          .run();
        return;
      case "delete":
        db.delete(foldersTable).where(eq(foldersTable.id, tx.id)).run();
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
