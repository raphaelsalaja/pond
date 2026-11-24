import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  activityNotificationId,
  postNotification,
} from "@/shared/lib/notification-log";

export interface ActivityEntry {
  readonly id: number;
  readonly label: string;
  readonly startedAt: number;
}

const store = new Store<{ entries: ReadonlyArray<ActivityEntry> }>({
  entries: [],
});
let nextId = 1;

function settle(id: number): ActivityEntry | null {
  const entry = store.state.entries.find((item) => item.id === id) ?? null;
  if (entry) {
    store.setState((s) => ({
      entries: s.entries.filter((item) => item.id !== id),
    }));
  }
  return entry;
}

function finished(label: string, message?: string): void {
  postNotification({
    id: activityNotificationId(),
    kind: "activity",
    priority: false,
    title: label,
    body: message,
  });
}

function failed(label: string, message: string): void {
  postNotification({
    id: activityNotificationId(),
    kind: "attention",
    priority: true,
    title: label,
    body: message,
  });
}

/** Running jobs stay in this window as pinned Inbox rows; settled ones land in the notification log. */
export const statusFeed = {
  start(label: string): number {
    const id = nextId++;
    store.setState((s) => ({
      entries: [{ id, label, startedAt: Date.now() }, ...s.entries],
    }));
    return id;
  },
  done(id: number, message?: string): void {
    const entry = settle(id);
    if (entry) {
      finished(entry.label, message);
    }
  },
  fail(id: number, message: string): void {
    const entry = settle(id);
    if (entry) {
      failed(entry.label, message);
    }
  },
  dismiss(id: number): void {
    settle(id);
  },
  error(label: string, message: string): void {
    failed(label, message);
  },
};

export function useStatusFeed(): ReadonlyArray<ActivityEntry> {
  return useSelector(store, (s) => s.entries);
}
