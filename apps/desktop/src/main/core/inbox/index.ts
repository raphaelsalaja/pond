import type { InboxChannel, InboxFields } from "@pond/schema/inbox";
import { getPrefs } from "../prefs";
import { inboxChannelForTrigger, inboxEntry } from "./intake";

export { returnDueSnoozes } from "./snooze";

export async function newSaveInbox(
  channel: InboxChannel | undefined,
): Promise<InboxFields> {
  return inboxEntry(channel, await getPrefs());
}

export function newSaveInboxForTrigger(
  trigger: string | undefined,
): Promise<InboxFields> {
  return newSaveInbox(inboxChannelForTrigger(trigger));
}
