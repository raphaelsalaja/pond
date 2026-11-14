import { saves } from "@pond/schema/db";
import { inboxFields } from "@pond/schema/inbox";
import type { Transaction } from "@pond/schema/tx";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../../db";
import { executeBatch } from "../executor";

const RETURN_CHUNK = 500;

function returnToReview(row: {
  id: string;
  inboxUntil: number | null;
}): Transaction {
  return {
    kind: "update",
    model: "save",
    id: row.id,
    before: { inboxState: "snoozed", inboxUntil: row.inboxUntil },
    patch: inboxFields("review"),
    meta: { actor: "system", actorReason: "inbox:snooze-return" },
  };
}

/** Snoozed Saves whose time has come go back to needing review. */
export async function returnDueSnoozes(now = Date.now()): Promise<number> {
  const db = await getDb();
  const due = db
    .select({ id: saves.id, inboxUntil: saves.inboxUntil })
    .from(saves)
    .where(and(eq(saves.inboxState, "snoozed"), lte(saves.inboxUntil, now)))
    .all();
  for (let offset = 0; offset < due.length; offset += RETURN_CHUNK) {
    const batch = due.slice(offset, offset + RETURN_CHUNK);
    await executeBatch(batch.map(returnToReview));
  }
  return due.length;
}
