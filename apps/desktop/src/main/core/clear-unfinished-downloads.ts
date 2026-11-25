import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { and, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../db";

export async function clearUnfinishedDownloads(
  db: Db,
  commit: (transactions: Array<Transaction>) => Promise<void>,
  recordUndo: (transactions: Array<Transaction>) => void,
): Promise<{ changed: number; ids: Array<string> }> {
  const rows = db
    .select({ id: saves.id })
    .from(saves)
    .where(
      and(
        isNull(saves.deletedAt),
        ne(saves.source, "local"),
        inArray(saves.status, ["ingesting", "failed", "skipped"]),
      ),
    )
    .all();
  const transactions = rows.map((row): Transaction => ({
    kind: "trash",
    model: "save",
    id: row.id,
    meta: { actor: "user", actorReason: "downloads:clear-unfinished" },
  }));
  if (transactions.length === 0) {
    return { changed: 0, ids: [] };
  }
  await commit(transactions);
  recordUndo(transactions);
  return { changed: transactions.length, ids: rows.map((row) => row.id) };
}
