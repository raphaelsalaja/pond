import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type InboxNotification,
  InboxNotificationSchema,
  NOTIFICATION_CAP,
  type NotificationPost,
} from "../../../shared/notification-contracts";
import { renameWithRetry } from "../../lib/rename-retry";

const LOG_VERSION = 2;

/** Rows of a retired kind drop on load instead of emptying the whole log. */
const StoredRowsSchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => {
    const item = InboxNotificationSchema.safeParse(row);
    return item.success ? [item.data] : [];
  }),
);

const StoredLogSchema = z.object({
  version: z.union([z.literal(1), z.literal(LOG_VERSION)]),
  notifications: StoredRowsSchema,
});

/** Version 1 copied every toast into the log as activity, so those rows drop on upgrade. */
function upgrade(log: z.infer<typeof StoredLogSchema>): InboxNotification[] {
  if (log.version === LOG_VERSION) return log.notifications;
  return log.notifications.filter((item) => item.kind !== "activity");
}

export interface NotificationLogDependencies {
  directory(): string;
  libraryId(): string;
  now(): number;
  onChange(): void;
}

type Change = (
  items: readonly InboxNotification[],
  now: number,
) => InboxNotification[] | null;

function newestFirst(items: readonly InboxNotification[]): InboxNotification[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function capNotifications(
  items: readonly InboxNotification[],
): InboxNotification[] {
  if (items.length <= NOTIFICATION_CAP) return [...items];
  const oldestFirst = newestFirst(items).reverse();
  const drop = new Set<string>();
  const over = () => items.length - drop.size > NOTIFICATION_CAP;
  for (const item of oldestFirst) {
    if (!over()) break;
    if (item.readAt !== undefined) drop.add(item.id);
  }
  for (const item of oldestFirst) {
    if (!over()) break;
    drop.add(item.id);
  }
  return items.filter((item) => !drop.has(item.id));
}

/** Notifications describe one Library, so the log lives beside its index in app data. */
export function createNotificationLog(deps: NotificationLogDependencies) {
  let cache: { libraryId: string; items: InboxNotification[] } | null = null;
  /** Renderer posts arrive in bursts; one queue keeps each write based on the last. */
  let queue: Promise<unknown> = Promise.resolve();

  function file(libraryId: string): string {
    return join(deps.directory(), `${encodeURIComponent(libraryId)}.json`);
  }

  async function read(libraryId: string): Promise<InboxNotification[]> {
    let text: string;
    try {
      text = await readFile(file(libraryId), "utf8");
    } catch {
      return [];
    }
    try {
      const parsed = StoredLogSchema.safeParse(JSON.parse(text));
      return parsed.success ? upgrade(parsed.data) : [];
    } catch {
      return [];
    }
  }

  async function write(
    libraryId: string,
    items: readonly InboxNotification[],
  ): Promise<void> {
    await mkdir(deps.directory(), { recursive: true });
    const target = file(libraryId);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({ version: LOG_VERSION, notifications: items }),
      "utf8",
    );
    await renameWithRetry(temporary, target);
  }

  async function load() {
    const libraryId = deps.libraryId();
    if (cache?.libraryId === libraryId) return cache;
    const items = await read(libraryId);
    cache = { libraryId, items };
    return cache;
  }

  function mutate(change: Change): Promise<void> {
    const run = queue.then(async () => {
      const current = await load();
      const next = change(current.items, deps.now());
      if (!next) return;
      const items = capNotifications(next);
      await write(current.libraryId, items);
      cache = { libraryId: current.libraryId, items };
      deps.onChange();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function update(
    ids: readonly string[],
    patch: (item: InboxNotification, now: number) => InboxNotification,
  ): Promise<void> {
    const wanted = new Set(ids);
    return mutate((items, now) => {
      if (!items.some((item) => wanted.has(item.id))) return null;
      return items.map((item) =>
        wanted.has(item.id) ? patch(item, now) : item,
      );
    });
  }

  function remove(keep: (item: InboxNotification) => boolean): Promise<void> {
    return mutate((items) => {
      const next = items.filter(keep);
      return next.length === items.length ? null : next;
    });
  }

  async function list(): Promise<InboxNotification[]> {
    await queue;
    return newestFirst((await load()).items);
  }

  /** Posting an existing id updates it; new wording marks it unread again. */
  function post(input: NotificationPost): Promise<void> {
    return mutate((items, now) => {
      const existing = items.find((item) => item.id === input.id);
      if (!existing)
        return [{ ...input, createdAt: now, updatedAt: now }, ...items];
      const reworded =
        existing.title !== input.title || existing.body !== input.body;
      const same =
        !reworded &&
        existing.kind === input.kind &&
        existing.priority === input.priority &&
        JSON.stringify(existing.target) === JSON.stringify(input.target);
      if (same) return null;
      const next: InboxNotification = {
        id: input.id,
        kind: input.kind,
        priority: input.priority,
        title: input.title,
        body: input.body,
        target: input.target,
        createdAt: existing.createdAt,
        updatedAt: reworded ? now : existing.updatedAt,
        readAt: reworded ? undefined : existing.readAt,
        snoozedUntil: existing.snoozedUntil,
      };
      return items.map((item) => (item.id === input.id ? next : item));
    });
  }

  function markRead(ids: readonly string[], read: boolean): Promise<void> {
    return update(ids, (item, now) => ({
      ...item,
      readAt: read ? (item.readAt ?? now) : undefined,
    }));
  }

  function snooze(ids: readonly string[], until: number | null): Promise<void> {
    return update(ids, (item) => ({
      ...item,
      snoozedUntil: until ?? undefined,
    }));
  }

  function resolve(ids: readonly string[]): Promise<void> {
    const gone = new Set(ids);
    return remove((item) => !gone.has(item.id));
  }

  function deleteRead(): Promise<void> {
    return remove((item) => item.readAt === undefined);
  }

  /** A snooze that runs out brings the notification back unread, like a new one. */
  async function returnDueSnoozes(): Promise<number> {
    let returned = 0;
    await mutate((items, now) => {
      returned = 0;
      const next = items.map((item) => {
        if (item.snoozedUntil === undefined || item.snoozedUntil > now)
          return item;
        returned += 1;
        return {
          ...item,
          snoozedUntil: undefined,
          readAt: undefined,
          updatedAt: now,
        };
      });
      return returned > 0 ? next : null;
    });
    return returned;
  }

  return {
    list,
    post,
    markRead,
    snooze,
    resolve,
    delete: resolve,
    deleteRead,
    returnDueSnoozes,
  };
}

export type NotificationLog = ReturnType<typeof createNotificationLog>;
