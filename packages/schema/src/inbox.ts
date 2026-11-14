export const INBOX_STATES = ["needs_review", "snoozed", "processed"] as const;
export type InboxState = (typeof INBOX_STATES)[number];

export const INBOX_STATE_LABELS = {
  needs_review: "Needs Review",
  snoozed: "Snoozed",
  processed: "Processed",
} satisfies Record<InboxState, string>;

/** How a new Save reached the library. Each path feeds the Inbox on its own switch. */
export const INBOX_INTAKES = [
  "captures",
  "imports",
  "syncs",
  "watches",
] as const;
export type InboxIntake = (typeof INBOX_INTAKES)[number];

export interface InboxFields {
  inboxState: InboxState | null;
  inboxUntil: number | null;
}

/** Snooze is the only state with a due time; every other state clears it. */
export function inboxFields(
  state: InboxState | null,
  until?: number | null,
): InboxFields {
  return {
    inboxState: state,
    inboxUntil: state === "snoozed" ? (until ?? null) : null,
  };
}
