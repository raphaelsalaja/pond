import type { InboxNotification } from "@shared/notification-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";

interface NotificationsState {
  items: readonly InboxNotification[];
  loaded: boolean;
}

const store = new Store<NotificationsState>({ items: [], loaded: false });
let subscribers = 0;
let unsubscribe: (() => void) | null = null;
let ticket = 0;

async function refresh(): Promise<void> {
  const request = ++ticket;
  const items = await window.pond.query("notifications.list", {});
  if (request !== ticket) return;
  store.setState(() => ({ items, loaded: true }));
}

/** Changes show at once; main's broadcast then brings the stored log back in line. */
function optimistic(
  change: (items: readonly InboxNotification[]) => InboxNotification[],
  send: () => Promise<unknown>,
): void {
  ticket += 1;
  store.setState((state) => ({ ...state, items: change(state.items) }));
  void send().catch(() => refresh().catch(() => undefined));
}

function patch(
  ids: readonly string[],
  change: (item: InboxNotification) => InboxNotification,
  send: () => Promise<unknown>,
): void {
  const wanted = new Set(ids);
  optimistic(
    (items) => items.map((item) => (wanted.has(item.id) ? change(item) : item)),
    send,
  );
}

export function isSnoozed(item: InboxNotification): boolean {
  return item.snoozedUntil !== undefined;
}

export function isUnread(item: InboxNotification): boolean {
  return item.readAt === undefined;
}

export const notifications = {
  refresh,
  markRead(ids: readonly string[], read: boolean): void {
    if (ids.length === 0) return;
    const now = Date.now();
    patch(
      ids,
      (item) => ({ ...item, readAt: read ? (item.readAt ?? now) : undefined }),
      () => window.pond.query("notifications.markRead", { ids: [...ids], read }),
    );
  },
  markAllRead(): void {
    const unread = store.state.items.filter(
      (item) => isUnread(item) && !isSnoozed(item),
    );
    notifications.markRead(
      unread.map((item) => item.id),
      true,
    );
  },
  snooze(ids: readonly string[], until: number | null): void {
    if (ids.length === 0) return;
    patch(
      ids,
      (item) => ({ ...item, snoozedUntil: until ?? undefined }),
      () => window.pond.query("notifications.snooze", { ids: [...ids], until }),
    );
  },
  remove(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    optimistic(
      (items) => items.filter((item) => !gone.has(item.id)),
      () => window.pond.query("notifications.delete", { ids: [...ids] }),
    );
  },
  removeRead(): void {
    if (!store.state.items.some((item) => !isUnread(item))) return;
    optimistic(
      (items) => items.filter(isUnread),
      () => window.pond.query("notifications.delete", { read: true }),
    );
  },
  find(id: string): InboxNotification | null {
    return store.state.items.find((item) => item.id === id) ?? null;
  },
};

/** One subscription to main's notification broadcast serves every mounted consumer. */
export function useHydrateNotifications(): void {
  useEffect(() => {
    if (subscribers++ === 0) {
      void refresh().catch(() => undefined);
      unsubscribe = window.pond.onNotifications(() => {
        void refresh().catch(() => undefined);
      });
    }
    return () => {
      if (--subscribers > 0) return;
      unsubscribe?.();
      unsubscribe = null;
    };
  }, []);
}

export function useNotifications(): readonly InboxNotification[] {
  return useSelector(store, (state) => state.items);
}

export function useNotification(id: string | null): InboxNotification | null {
  return useSelector(store, (state) =>
    id == null ? null : (state.items.find((item) => item.id === id) ?? null),
  );
}
