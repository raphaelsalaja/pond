import { isSnoozed, isUnread, useNotifications } from "./notifications";
import { useInboxProgress } from "./progress";

/** Feeds the rail's Inbox item: its count, and whether to show a working or attention dot. */
export function useInboxSignal() {
  const items = useNotifications();
  const progress = useInboxProgress();
  let priority = 0;
  let attention = false;
  for (const item of items) {
    if (isSnoozed(item) || !isUnread(item)) continue;
    if (item.priority) priority += 1;
    if (item.kind === "attention") attention = true;
  }
  return { priority, attention, working: progress.length > 0 };
}
