import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  postNotification,
  resolveNotifications,
} from "@/shared/lib/notification-log";

export interface Announcement {
  id: string;
  title: string;
  description: string;
  open: () => void;
  /** Persists the read state, so a dismissed announcement never posts again. */
  markSeen: () => void;
}

/** Open handlers live only in memory; after a restart the stored notification shows its text alone. */
const store = new Store<ReadonlyMap<string, Announcement>>(new Map());

function take(id: string): Announcement | null {
  const item = store.state.get(id) ?? null;
  if (item)
    store.setState((items) => {
      const next = new Map(items);
      next.delete(id);
      return next;
    });
  return item;
}

function announcementNotificationId(id: string): string {
  return `announcement:${id}`;
}

export const announcements = {
  post(announcement: Announcement): void {
    if (store.state.has(announcement.id)) return;
    store.setState((items) =>
      new Map(items).set(announcement.id, announcement),
    );
    postNotification({
      id: announcementNotificationId(announcement.id),
      kind: "announcement",
      priority: false,
      title: announcement.title,
      body: announcement.description,
      target: { type: "announcement", id: announcement.id },
    });
  },
  open(id: string): void {
    const item = take(id);
    if (!item) return;
    item.markSeen();
    item.open();
  },
  /** Deleting the notification counts as seeing it. */
  dismiss(id: string): void {
    take(id)?.markSeen();
  },
  clear(): void {
    const ids = [...store.state.keys()];
    for (const item of store.state.values()) item.markSeen();
    store.setState(() => new Map());
    resolveNotifications(ids.map(announcementNotificationId));
  },
};

export function useAnnouncementOpenable(id: string | null): boolean {
  return useSelector(store, (items) => id != null && items.has(id));
}
