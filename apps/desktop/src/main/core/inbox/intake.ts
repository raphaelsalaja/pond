import type { Prefs } from "@pond/schema/db";
import {
  type InboxChannel,
  type InboxFields,
  inboxFields,
  NOT_IN_INBOX,
} from "@pond/schema/inbox";

/** Account and Watch runs prefix their enqueue triggers; every unprefixed trigger is someone saving one thing. */
export function inboxChannelForTrigger(
  trigger: string | undefined,
): InboxChannel {
  if (!trigger) return "captures";
  if (
    trigger.startsWith("sync:") ||
    trigger === "cron" ||
    trigger === "launch" ||
    trigger === "manual"
  )
    return "sync";
  if (trigger.startsWith("watch:")) return "watches";
  if (
    trigger.startsWith("user:import") ||
    trigger.startsWith("pipeline:") ||
    trigger.startsWith("enqueue:")
  )
    return "imports";
  return "captures";
}

/** The Inbox fields a brand-new Save starts with. A Save made without a channel, like a crop copy, stays out. */
export function inboxEntry(
  channel: InboxChannel | undefined,
  prefs: Pick<Prefs, "inbox">,
): InboxFields {
  if (!channel || !prefs.inbox.enabled || !prefs.inbox.channels[channel])
    return NOT_IN_INBOX;
  return inboxFields("review");
}
