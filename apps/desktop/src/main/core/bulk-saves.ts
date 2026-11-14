import { saves, tags } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { inArray } from "drizzle-orm";
import type { BulkEdit } from "../../shared/bulk-contracts";
import type { UndoableChange } from "../../shared/query-contracts-shared";
import type { Db } from "../db";
import { normalizeTagList, planTagRegistryUpdates } from "./tags";

export async function bulkEditSaves(
  input: BulkEdit,
  db: Db,
  commit: (transactions: Transaction[]) => Promise<void>,
  recordUndo: (transactions: Transaction[]) => string | null,
): Promise<{ changed: number } & UndoableChange> {
  const ids = [...new Set(input.ids)];
  const transactions: Transaction[] = [];
  const meta = {
    actor: "user",
    actorReason: input.actorReason ?? `selection:${input.operation.kind}`,
  } as const;
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const wanted = ids.slice(offset, offset + 1000);
    const condition = inArray(saves.id, wanted);
    const operation = input.operation;
    if (operation.kind === "purge") {
      const rows = db.select().from(saves).where(condition).all();
      if (rows.length !== wanted.length)
        throw new Error(
          "A selected Save is no longer available. Refresh the selection.",
        );
      transactions.push(
        ...rows.map(
          (row): Transaction => ({
            kind: "purge",
            model: "save",
            id: row.id,
            before: row,
            meta,
          }),
        ),
      );
      continue;
    }
    const rows = db
      .select({
        id: saves.id,
        tags: saves.tags,
        rating: saves.rating,
        favorite: saves.favorite,
        notes: saves.notes,
        suggestedTags: saves.suggestedTags,
        deletedAt: saves.deletedAt,
      })
      .from(saves)
      .where(condition)
      .all();
    if (rows.length !== wanted.length)
      throw new Error(
        "A selected Save is no longer available. Refresh the selection.",
      );
    for (const row of rows) {
      if (operation.kind === "tags" || operation.kind === "suggested-tags") {
        const removed = new Set(
          operation.kind === "tags"
            ? normalizeTagList(operation.tags).map((tag) => tag.toLowerCase())
            : [],
        );
        const next =
          operation.kind === "tags" && operation.mode === "remove"
            ? row.tags.filter((tag) => !removed.has(tag.toLowerCase()))
            : operation.kind === "tags" && operation.mode === "replace"
              ? normalizeTagList(operation.tags)
              : normalizeTagList([
                  ...row.tags,
                  ...(operation.kind === "tags"
                    ? operation.tags
                    : (row.suggestedTags ?? [])),
                ]);
        if (JSON.stringify(next) !== JSON.stringify(row.tags))
          transactions.push({
            kind: "update",
            model: "save",
            id: row.id,
            before: { tags: row.tags },
            patch: { tags: next },
            meta,
          });
      } else if (operation.kind === "notes") {
        if (row.notes !== operation.notes)
          transactions.push({
            kind: "update",
            model: "save",
            id: row.id,
            before: { notes: row.notes },
            patch: { notes: operation.notes },
            meta,
          });
      } else if (operation.kind === "rating") {
        const next = operation.rating || null;
        if (!row.deletedAt && next !== row.rating)
          transactions.push({
            kind: "update",
            model: "save",
            id: row.id,
            before: { rating: row.rating },
            patch: { rating: next },
            meta,
          });
      } else if (operation.kind === "favorite") {
        if (!row.deletedAt && operation.favorite !== row.favorite)
          transactions.push({
            kind: "update",
            model: "save",
            id: row.id,
            before: { favorite: row.favorite },
            patch: { favorite: operation.favorite },
            meta,
          });
      } else if ((operation.kind === "trash") !== Boolean(row.deletedAt))
        transactions.push({
          kind: operation.kind,
          model: "save",
          id: row.id,
          meta,
        });
    }
  }
  const changed = transactions.length;
  if (!changed) return { changed: 0, undoId: null };
  if (
    input.operation.kind === "tags" ||
    input.operation.kind === "suggested-tags"
  )
    transactions.unshift(
      ...planTagRegistryUpdates(
        transactions.flatMap((tx) =>
          tx.kind === "update" && tx.model === "save"
            ? (tx.patch.tags ?? [])
            : [],
        ),
        db.select().from(tags).all(),
      ),
    );
  await commit(transactions);
  const undoId =
    input.operation.kind === "purge" ? null : recordUndo(transactions);
  return { changed, undoId };
}
