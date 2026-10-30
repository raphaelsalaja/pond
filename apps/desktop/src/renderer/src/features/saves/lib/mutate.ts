import type { NewSave } from "@pond/schema/db";
import type { Transaction, TxMeta } from "@pond/schema/tx";
import { optimistic } from "@/features/saves/lib/optimistic";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { emitFeedback } from "@/shared/lib/sounds";

interface MutateOpts {
  actorReason?: string;
  throwOnError?: boolean;
}

export type SaveEdit = Partial<
  Omit<
    Save,
    | "id"
    | "tasks"
    | "savedAt"
    | "createdAt"
    | "deletedAt"
    | "publishedAt"
    | "takenAt"
    | "ingestStartedAt"
    | "ingestCompletedAt"
  >
>;

function metaFor(opts: MutateOpts): TxMeta | undefined {
  if (!opts.actorReason) return undefined;
  return { actor: "user", actorReason: opts.actorReason };
}

function toNewSave(save: Save): NewSave {
  const { tasks: _tasks, ...columns } = save;
  return {
    ...columns,
    savedAt: new Date(save.savedAt),
    createdAt: new Date(save.createdAt),
    deletedAt: save.deletedAt === null ? null : new Date(save.deletedAt),
    publishedAt: save.publishedAt == null ? null : new Date(save.publishedAt),
    takenAt: save.takenAt == null ? null : new Date(save.takenAt),
    ingestStartedAt:
      save.ingestStartedAt == null ? null : new Date(save.ingestStartedAt),
    ingestCompletedAt:
      save.ingestCompletedAt == null ? null : new Date(save.ingestCompletedAt),
  };
}

function snapshotBefore(prev: Save, patch: SaveEdit): Partial<NewSave> {
  const previous = toNewSave(prev);
  const before: Partial<NewSave> = {};
  for (const [key, value] of Object.entries(previous)) {
    if (!Object.hasOwn(patch, key)) continue;
    Object.assign(before, { [key]: value });
  }
  return before;
}

export async function mutateSave(
  id: string,
  patch: SaveEdit,
  opts: MutateOpts = {},
): Promise<void> {
  const prev = pool.get(id);
  if (!prev) {
    if (opts.throwOnError) throw new Error("This save is no longer available.");
    return;
  }
  const tx: Transaction = {
    kind: "update",
    model: "save",
    id,
    patch,
    before: snapshotBefore(prev, patch),
  };
  const meta = metaFor(opts);
  if (meta) tx.meta = meta;
  const result = await optimistic(
    () => pool.upsert({ ...prev, ...patch }),
    () => pool.upsert(prev),
    async () => window.pond.tx(tx),
  );
  if (result === null && opts.throwOnError)
    throw new Error(
      "Couldn't save changes. Your previous version is unchanged.",
    );
}

export async function setSaveTags(id: string, tags: string[]): Promise<void> {
  const prev = pool.get(id);
  if (!prev) return;
  await optimistic(
    () => pool.upsert({ ...prev, tags }),
    () => pool.upsert(prev),
    async () => window.pond.query("tags.setForSave", { saveId: id, tags }),
  );
}

export async function trashSave(id: string): Promise<void> {
  const prev = pool.get(id);
  if (!prev) return;
  await optimistic(
    () => pool.upsert({ ...prev, deletedAt: Date.now() }),
    () => pool.upsert(prev),
    async () => window.pond.tx({ kind: "trash", model: "save", id }),
  );
  emitFeedback("saveDeletion");
}

export async function untrashSave(id: string): Promise<void> {
  const prev = pool.get(id);
  if (!prev) return;
  await optimistic(
    () => pool.upsert({ ...prev, deletedAt: null }),
    () => pool.upsert(prev),
    async () => window.pond.tx({ kind: "untrash", model: "save", id }),
  );
}

export async function purgeSave(id: string): Promise<void> {
  const prev = pool.get(id);
  if (!prev) return;
  await optimistic(
    () => pool.delete(id),
    () => pool.upsert(prev),
    async () =>
      window.pond.tx({
        kind: "purge",
        model: "save",
        id,
        before: toNewSave(prev),
      }),
  );
  emitFeedback("saveDeletion");
}

export async function bulkMutation(
  ids: readonly string[],
  operation: import("@shared/bulk-contracts").BulkEdit["operation"],
  opts: MutateOpts = {},
): Promise<number> {
  const targets = [...new Set(ids)];
  if (!targets.length) return 0;
  const before = targets.flatMap((id) => {
    const save = pool.get(id);
    return save ? [save] : [];
  });
  if (operation.kind === "purge") {
    pool.bulkDelete(before.map((save) => save.id));
  } else {
    const updates: Save[] = [];
    for (const save of before) {
      if (operation.kind === "trash")
        updates.push({ ...save, deletedAt: Date.now() });
      else if (operation.kind === "untrash")
        updates.push({ ...save, deletedAt: null });
      else if (operation.kind === "rating" && !save.deletedAt)
        updates.push({ ...save, rating: operation.rating || null });
      else if (operation.kind === "notes")
        updates.push({ ...save, notes: operation.notes });
      else if (operation.kind === "tags" && operation.mode === "replace")
        updates.push({ ...save, tags: operation.tags });
    }
    pool.bulkUpsert(updates);
  }
  try {
    const result = await window.pond.query("saves.bulkEdit", {
      ids: targets,
      operation,
      ...opts,
    });
    if (
      result.changed > 0 &&
      (operation.kind === "trash" || operation.kind === "purge")
    ) {
      emitFeedback("saveDeletion");
    }
    return result.changed;
  } catch (error) {
    // Match single-upsert's reference no-op without changing rollback policy:
    // all changed pre-operation Saves are restored, including intervening edits.
    pool.bulkUpsert(before.filter((save) => pool.get(save.id) !== save));
    throw error;
  }
}
export async function trashSaves(
  ids: readonly string[],
  opts: MutateOpts = {},
): Promise<number> {
  return bulkMutation(ids, { kind: "trash" }, opts);
}
export async function untrashSaves(
  ids: readonly string[],
  opts: MutateOpts = {},
): Promise<number> {
  return bulkMutation(ids, { kind: "untrash" }, opts);
}
export async function purgeSaves(ids: readonly string[]): Promise<number> {
  return bulkMutation(ids, { kind: "purge" });
}
