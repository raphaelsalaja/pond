import type { NewSave } from "@pond/schema/db";
import { applyInboxChange } from "@pond/schema/inbox";
import type { Transaction, TxMeta } from "@pond/schema/tx";
import type { BulkEdit, BulkQueryResults } from "@shared/bulk-contracts";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { optimistic } from "@/features/saves/lib/optimistic";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { emitFeedback } from "@/shared/lib/sounds";

type BulkEditResult = BulkQueryResults["saves.bulkEdit"];

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

/** The bounded pool may have evicted the row; the edit applies to the refetched row instead of being dropped. */
async function refetch(id: string): Promise<Save | undefined> {
  await ensureSaves([id]).catch(() => undefined);
  return pool.get(id);
}

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
    publishedAt: dateOrNull(save.publishedAt),
    takenAt: dateOrNull(save.takenAt),
    ingestStartedAt: dateOrNull(save.ingestStartedAt),
    ingestCompletedAt: dateOrNull(save.ingestCompletedAt),
  };
}

function dateOrNull(value: number | null | undefined): Date | null {
  return value === undefined || value === null ? null : new Date(value);
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
  const prev = pool.get(id) ?? (await refetch(id));
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
  if (result === null && opts.throwOnError) {
    throw new Error(
      "Couldn't save changes. Your previous version is unchanged.",
    );
  }
}

export async function setSaveTags(
  id: string,
  tags: Array<string>,
): Promise<void> {
  const prev = pool.get(id) ?? (await refetch(id));
  if (!prev) return;
  await optimistic(
    () => pool.upsert({ ...prev, tags }),
    () => pool.upsert(prev),
    async () => window.pond.query("tags.setForSave", { saveId: id, tags }),
  );
}

export async function untrashSave(id: string): Promise<void> {
  const prev = pool.get(id) ?? (await refetch(id));
  if (!prev) return;
  await optimistic(
    () => pool.upsert({ ...prev, deletedAt: null }),
    () => pool.upsert(prev),
    async () => window.pond.tx({ kind: "untrash", model: "save", id }),
  );
}

export async function purgeSave(id: string): Promise<void> {
  const prev = pool.get(id) ?? (await refetch(id));
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

export interface BulkMutationDeps {
  bulkEdit: (input: BulkEdit) => Promise<BulkEditResult>;
  onDeletion: () => void;
}

const bulkMutationDeps: BulkMutationDeps = {
  bulkEdit: (input) => window.pond.query("saves.bulkEdit", input),
  onDeletion: () => emitFeedback("saveDeletion"),
};

export async function bulkMutation(
  ids: ReadonlyArray<string>,
  operation: BulkEdit["operation"],
  opts: MutateOpts = {},
  deps: BulkMutationDeps = bulkMutationDeps,
): Promise<BulkEditResult> {
  const targets = [...new Set(ids)];
  if (!targets.length) return { changed: 0, undoId: null };
  const before = targets.flatMap((id) => {
    const save = pool.get(id);
    return save ? [save] : [];
  });
  if (operation.kind === "purge") {
    pool.bulkDelete(before.map((save) => save.id));
  } else {
    const updates: Array<Save> = [];
    for (const save of before) {
      if (operation.kind === "trash") {
        updates.push({ ...save, deletedAt: Date.now() });
      } else if (operation.kind === "untrash") {
        updates.push({ ...save, deletedAt: null });
      } else if (operation.kind === "rating" && !save.deletedAt) {
        updates.push({ ...save, rating: operation.rating || null });
      } else if (operation.kind === "favorite" && !save.deletedAt) {
        updates.push({ ...save, favorite: operation.favorite });
      } else if (operation.kind === "notes") {
        updates.push({ ...save, notes: operation.notes });
      } else if (operation.kind === "inbox" || operation.kind === "snooze") {
        const next = applyInboxChange(operation, {
          inboxState: save.inboxState ?? null,
          inboxUntil: save.inboxUntil ?? null,
          deletedAt: save.deletedAt,
        });
        if (next) {
          updates.push({ ...save, ...next });
        }
      } else if (operation.kind === "tags" && operation.mode === "replace") {
        updates.push({ ...save, tags: operation.tags });
      }
    }
    pool.bulkUpsert(updates);
  }
  try {
    const result = await deps.bulkEdit({
      ids: targets,
      operation,
      ...opts,
    });
    if (
      result.changed > 0 &&
      (operation.kind === "trash" || operation.kind === "purge")
    ) {
      deps.onDeletion();
    }
    return { changed: result.changed, undoId: result.undoId ?? null };
  } catch (error) {
    /** Skips Saves still identical to match single-upsert's no-op; every other one, intervening edits included, rolls back. */
    pool.bulkUpsert(before.filter((save) => pool.get(save.id) !== save));
    throw error;
  }
}
export async function trashSaves(
  ids: ReadonlyArray<string>,
  opts: MutateOpts = {},
): Promise<BulkEditResult> {
  return bulkMutation(ids, { kind: "trash" }, opts);
}
export async function untrashSaves(
  ids: ReadonlyArray<string>,
  opts: MutateOpts = {},
): Promise<BulkEditResult> {
  return bulkMutation(ids, { kind: "untrash" }, opts);
}
export async function purgeSaves(
  ids: ReadonlyArray<string>,
): Promise<BulkEditResult> {
  return bulkMutation(ids, { kind: "purge" });
}
