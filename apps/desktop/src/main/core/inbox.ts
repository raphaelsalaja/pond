import { type Prefs, saves } from "@pond/schema/db";
import type { ImportOrigin } from "@pond/schema/import-origin";
import {
  type InboxIntake,
  type InboxState,
  inboxFields,
} from "@pond/schema/inbox";
import type { Transaction } from "@pond/schema/tx";
import { and, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { executeBatch } from "./executor";
import { getPrefs } from "./prefs";

const SNOOZE_BATCH = 500;

export function inboxIntakeForTrigger(
  trigger: string | undefined,
): InboxIntake | null {
  if (!trigger) return "captures";
  if (
    trigger.startsWith("sync:") ||
    trigger === "cron" ||
    trigger === "manual" ||
    trigger === "launch"
  )
    return "syncs";
  if (trigger.startsWith("watch:")) return "watches";
  if (trigger.startsWith("user:import")) return "imports";
  if (trigger.startsWith("pipeline:") || trigger.startsWith("enqueue:"))
    return null;
  return "captures";
}

/** Files and pastes you add by hand count as captures; everything brought in from another app is an import. */
export function inboxIntakeForOrigin(origin: ImportOrigin): InboxIntake {
  return origin === "files" || origin === "clipboard" ? "captures" : "imports";
}

export function initialInboxState(
  intake: InboxIntake | null,
  prefs: Prefs["inbox"],
): InboxState | null {
  return intake && prefs.enabled && prefs[intake] ? "needs_review" : null;
}

export async function inboxStateForIntake(
  intake: InboxIntake | null,
): Promise<InboxState | null> {
  if (!intake) return null;
  return initialInboxState(intake, (await getPrefs()).inbox);
}

export async function returnDueSnoozes(now = Date.now()): Promise<number> {
  const db = await getDb();
  const due = await db
    .select({ id: saves.id, inboxUntil: saves.inboxUntil })
    .from(saves)
    .where(
      and(
        eq(saves.inboxState, "snoozed"),
        lte(saves.inboxUntil, now),
        isNull(saves.deletedAt),
      ),
    )
    .limit(SNOOZE_BATCH);
  if (!due.length) return 0;
  await executeBatch(
    due.map(
      (row): Transaction => ({
        kind: "update",
        model: "save",
        id: row.id,
        before: { inboxState: "snoozed", inboxUntil: row.inboxUntil },
        patch: inboxFields("needs_review"),
        meta: { actor: "system", actorReason: "inbox:snooze-due" },
      }),
    ),
  );
  return due.length;
}
