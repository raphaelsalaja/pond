import type { Prefs } from "@pond/schema";
import type {
  InboxNotification,
  NotificationKind,
} from "@shared/notification-contracts";
import { shallow, useSelector } from "@tanstack/react-store";
import { useMemo } from "react";
import {
  inboxPicker,
  inboxReview,
  useInboxReview,
  useInboxReviewScope,
  useInboxSelection,
} from "@/features/library/state/inbox-review";
import {
  isSnoozed,
  isUnread,
  useInboxProgress,
  useNotifications,
} from "@/features/notifications";
import type { InboxProgress } from "@/features/notifications";
import { savesStore } from "@/features/saves/pool";
import { usePrefs } from "@/shared/state/prefs";

export type InboxItem =
  | { type: "progress"; key: string; progress: InboxProgress }
  | {
      type: "save";
      key: string;
      id: string;
      index: number;
      unread: boolean;
      at: number;
      section?: string;
    }
  | {
      type: "notification";
      key: string;
      notification: InboxNotification;
      unread: boolean;
      at: number;
      section?: string;
    };

type Entry = Exclude<InboxItem, { type: "progress" }>;

type Display = Prefs["inboxDisplay"];

const NO_IDS: ReadonlyArray<string> = [];

/** Saves count as priority: reviewing them is what the Inbox is for. */
function isPriority(entry: Entry): boolean {
  return entry.type === "save" || entry.notification.priority;
}

function rank(entry: Entry, display: Display): number {
  const unread = display.unreadFirst && !entry.unread ? 2 : 0;
  const priority =
    display.ordering === "priority" && !isPriority(entry) ? 1 : 0;
  return unread + priority;
}

/** Saves keep the review queue's order so the deck and the list never disagree; notifications merge in by rank, then time. */
function merge(
  saves: ReadonlyArray<Entry>,
  notifications: ReadonlyArray<Entry>,
  display: Display,
): Array<Entry> {
  const byRank = (a: Entry, b: Entry) => rank(a, display) - rank(b, display);
  const queue = saves.toSorted(byRank);
  const sorted = notifications.toSorted((a, b) => byRank(a, b) || b.at - a.at);
  const items: Array<Entry> = [];
  let next = 0;
  for (const save of queue) {
    for (; next < sorted.length; next += 1) {
      const notification = sorted[next];
      if (!notification) {
        break;
      }
      const order = byRank(notification, save);
      if (order > 0 || (order === 0 && notification.at <= save.at)) {
        break;
      }
      items.push(notification);
    }
    items.push(save);
  }
  return [...items, ...sorted.slice(next)];
}

const TYPE_SECTIONS = {
  save: "Saves",
  attention: "Needs Attention",
  activity: "Activity",
} satisfies Record<"save" | NotificationKind, string>;

const TYPE_ORDER = Object.values(TYPE_SECTIONS);

const DATE_ORDER = ["Today", "Yesterday", "Last 7 Days", "Older"];

const DAY = 24 * 60 * 60 * 1000;

function dateSection(at: number, today: number): string {
  if (at >= today) {
    return "Today";
  }
  if (at >= today - DAY) {
    return "Yesterday";
  }
  if (at >= today - 6 * DAY) {
    return "Last 7 Days";
  }
  return "Older";
}

/** Sections reorder the list so J and K walk it in the order it's drawn; rank order holds inside each section. */
function group(entries: Array<Entry>, by: Display["groupBy"]): Array<Entry> {
  if (by === "none") {
    return entries;
  }
  const today = new Date().setHours(0, 0, 0, 0);
  const order = by === "type" ? TYPE_ORDER : DATE_ORDER;
  return entries
    .map((entry) => ({
      ...entry,
      section:
        by === "type"
          ? TYPE_SECTIONS[
              entry.type === "save" ? "save" : entry.notification.kind
            ]
          : dateSection(entry.at, today),
    }))
    .toSorted((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

/** Saves and notifications, without the running-work rows. */
function useInboxEntries(): Array<Entry> {
  const queue = useInboxReview();
  const scope = useInboxReviewScope();
  const selected = useInboxSelection();
  const notifications = useNotifications();
  const [display] = usePrefs("inboxDisplay");
  const ids = queue?.ids ?? NO_IDS;
  const savedAt = useSelector(
    savesStore,
    (state) => ids.map((id) => state.byId.get(id)?.savedAt ?? 0),
    { compare: shallow },
  );
  const states = useSelector(
    savesStore,
    (state) =>
      ids.map((id) => {
        const save = state.byId.get(id);
        if (!save) {
          return "unloaded";
        }
        return save.deletedAt !== null ? "deleted" : (save.inboxState ?? null);
      }),
    { compare: shallow },
  );

  return useMemo(() => {
    const current = selected === null ? (queue?.index ?? -1) : -1;
    /** The open item stays listed after it's read, so unread-only never pulls it out from under you. */
    const shown = (entry: Entry) =>
      !display.unreadOnly ||
      entry.unread ||
      (entry.type === "save"
        ? entry.index === current
        : entry.key === selected);

    /** Resolved outcomes and saves whose state left the scope drop out; an unloaded save stays as a placeholder. */
    const scopeState = scope === "snoozed" ? "snoozed" : "review";
    const saves = ids.flatMap((id, index): Array<Entry> => {
      const outcome = queue?.outcomes[id];
      const state = states[index];
      if (outcome !== undefined && outcome !== "skip") {
        return [];
      }
      if (state !== "unloaded" && state !== scopeState) {
        return [];
      }
      const entry: Entry = {
        type: "save",
        key: `save:${id}`,
        id,
        index,
        unread: outcome === undefined,
        at: savedAt[index] ?? 0,
      };
      return shown(entry) ? [entry] : [];
    });
    const listed = notifications.flatMap((notification): Array<Entry> => {
      if (isSnoozed(notification) !== (scope === "snoozed")) {
        return [];
      }
      const entry: Entry = {
        type: "notification",
        key: notification.id,
        notification,
        unread: isUnread(notification),
        at: notification.updatedAt,
      };
      return shown(entry) ? [entry] : [];
    });
    return group(merge(saves, listed, display), display.groupBy);
  }, [ids, savedAt, states, queue, notifications, scope, selected, display]);
}

export function useInboxItems(): Array<InboxItem> {
  const entries = useInboxEntries();
  const progress = useInboxProgress();
  return useMemo(
    () => [
      ...progress.map((row): InboxItem => ({
        type: "progress",
        key: row.id,
        progress: row,
      })),
      ...entries,
    ],
    [progress, entries],
  );
}

function pick(item: Entry | undefined): void {
  if (item?.type === "save") {
    inboxReview.jump(item.index);
  } else {
    inboxPicker.select(item?.type === "notification" ? item.key : null);
  }
}

/** J and K walk Saves and notifications as one list; running-work rows aren't stops. */
export function useInboxNavigation() {
  const pickable = useInboxEntries();
  const queue = useInboxReview();
  const selected = useInboxSelection();
  const at = pickable.findIndex((item) =>
    item.type === "notification"
      ? item.key === selected
      : selected === null && item.index === queue?.index,
  );

  return {
    empty: pickable.length === 0,
    step(by: 1 | -1): void {
      if (at < 0) {
        pick(by > 0 ? pickable[0] : pickable.at(-1));
      } else {
        const next = pickable[at + by];
        if (next) {
          pick(next);
        }
      }
    },
    leave(): void {
      pick(pickable[at + 1] ?? pickable[at - 1]);
    },
  };
}
