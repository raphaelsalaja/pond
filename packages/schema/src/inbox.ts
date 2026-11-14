import { z } from "zod";

/** A Save with no Inbox state was never sent to the Inbox, which is how every Save from before the Inbox reads. */
export const INBOX_STATES = ["review", "snoozed", "processed"] as const;
export type InboxState = (typeof INBOX_STATES)[number];

export const INBOX_STATE_LABELS = {
  review: "Needs Review",
  snoozed: "Snoozed",
  processed: "Processed",
} satisfies Record<InboxState, string>;

export const InboxStateSchema = z.enum(INBOX_STATES);

/** The capture paths a new Save can arrive through, each with its own Inbox switch. */
const INBOX_CHANNELS = ["captures", "sync", "watches", "imports"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

/** One-off captures feed the Inbox; bulk paths stay out so one Sync can't bury it. */
export const DEFAULT_INBOX_CHANNELS = {
  captures: true,
  sync: false,
  watches: false,
  imports: false,
} as const satisfies Record<InboxChannel, boolean>;

/** The Inbox fields on a Save row. `inboxUntil` is epoch milliseconds and only set while snoozed. */
export interface InboxFields {
  inboxState: InboxState | null;
  inboxUntil: number | null;
}

export const NOT_IN_INBOX: InboxFields = { inboxState: null, inboxUntil: null };

/** Moves a Save into a state, dropping a snooze date that no longer applies. */
export function inboxFields(
  state: InboxState | null,
  until: number | null = null,
): InboxFields {
  return {
    inboxState: state,
    inboxUntil: state === "snoozed" ? until : null,
  };
}

type InboxChange =
  | { kind: "inbox"; state: "review" | "processed" | null }
  | { kind: "snooze"; until: number };

/** Processing only touches Saves waiting in the Inbox; sending to it skips the Trash. Null means nothing changes. */
export function applyInboxChange(
  change: InboxChange,
  save: InboxFields & { deletedAt?: unknown },
): InboxFields | null {
  const next = nextInbox(change, save);
  if (
    !next ||
    (next.inboxState === save.inboxState && next.inboxUntil === save.inboxUntil)
  )
    return null;
  return next;
}

function nextInbox(
  change: InboxChange,
  save: InboxFields & { deletedAt?: unknown },
): InboxFields | null {
  if (change.kind === "snooze")
    return save.deletedAt ? null : inboxFields("snoozed", change.until);
  if (change.state === "review")
    return save.deletedAt ? null : inboxFields("review");
  if (change.state === null) return save.inboxState ? NOT_IN_INBOX : null;
  if (save.inboxState !== "review" && save.inboxState !== "snoozed")
    return null;
  return inboxFields("processed");
}
