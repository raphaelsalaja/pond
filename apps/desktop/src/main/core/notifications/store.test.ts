import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NOTIFICATION_CAP } from "../../../shared/notification-contracts";
import type {
  InboxNotification,
  NotificationPost,
} from "../../../shared/notification-contracts";
import { capNotifications, createNotificationLog } from "./store";

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "pond-notifications-"));
  roots.push(root);
  const clock = { now: 1000 };
  const scope = { libraryId: "library-a" };
  let changes = 0;
  const log = createNotificationLog({
    directory: () => root,
    libraryId: () => scope.libraryId,
    now: () => clock.now,
    onChange: () => {
      changes += 1;
    },
  });
  return { root, clock, scope, log, changes: () => changes };
}

function post(id: string, extra: Partial<NotificationPost> = {}) {
  return {
    id,
    kind: "activity" as const,
    priority: false,
    title: `Title ${id}`,
    ...extra,
  };
}

const storedRow = (id: string, kind: string) => ({
  id,
  kind,
  priority: false,
  title: `Title ${id}`,
  createdAt: 1000,
  updatedAt: 1000,
});

describe("notification log", () => {
  it("adds a notification and updates it in place when posted again", async () => {
    const { log, clock, changes } = await setup();
    await log.post(post("a", { body: "First" }));
    clock.now = 2000;
    await log.post(post("a", { body: "Second" }));
    const items = await log.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "a",
      body: "Second",
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(changes()).toBe(2);
  });

  it("skips writes when the same notification is posted unchanged", async () => {
    const { log, changes } = await setup();
    await log.post(post("a"));
    await log.post(post("a"));
    expect(changes()).toBe(1);
  });

  it("marks a read notification unread again when its wording changes", async () => {
    const { log, clock } = await setup();
    await log.post(post("a", { body: "One" }));
    await log.markRead(["a"], true);
    expect((await log.list())[0]?.readAt).toBe(1000);
    clock.now = 5000;
    await log.post(post("a", { body: "Two" }));
    expect((await log.list())[0]?.readAt).toBeUndefined();
  });

  it("marks notifications read and unread", async () => {
    const { log } = await setup();
    await log.post(post("a"));
    await log.markRead(["a"], true);
    expect((await log.list())[0]?.readAt).toBeDefined();
    await log.markRead(["a"], false);
    expect((await log.list())[0]?.readAt).toBeUndefined();
  });

  it("returns snoozed notifications unread once their time passes", async () => {
    const { log, clock } = await setup();
    await log.post(post("a"));
    await log.markRead(["a"], true);
    await log.snooze(["a"], 10_000);
    expect(await log.returnDueSnoozes()).toBe(0);
    clock.now = 10_000;
    expect(await log.returnDueSnoozes()).toBe(1);
    const [item] = await log.list();
    expect(item?.snoozedUntil).toBeUndefined();
    expect(item?.readAt).toBeUndefined();
    expect(item?.updatedAt).toBe(10_000);
  });

  it("deletes every read notification and keeps unread ones", async () => {
    const { log } = await setup();
    await log.post(post("a"));
    await log.post(post("b"));
    await log.markRead(["a"], true);
    await log.deleteRead();
    expect((await log.list()).map((item) => item.id)).toEqual(["b"]);
  });

  it("resolves notifications by id", async () => {
    const { log } = await setup();
    await log.post(post("a"));
    await log.post(post("b"));
    await log.resolve(["a"]);
    expect((await log.list()).map((item) => item.id)).toEqual(["b"]);
  });

  it("keeps each Library's notifications apart", async () => {
    const { log, scope } = await setup();
    await log.post(post("a"));
    scope.libraryId = "library-b";
    expect(await log.list()).toEqual([]);
    await log.post(post("b"));
    scope.libraryId = "library-a";
    expect((await log.list()).map((item) => item.id)).toEqual(["a"]);
  });

  it("persists the log to disk", async () => {
    const { log, root } = await setup();
    await log.post(post("a"));
    const stored = JSON.parse(
      await readFile(join(root, "library-a.json"), "utf8"),
    );
    expect(stored.version).toBe(2);
    expect(stored.notifications[0].id).toBe("a");
  });

  it("drops activity and retired kinds from a version 1 log", async () => {
    const { log, root } = await setup();
    await writeFile(
      join(root, "library-a.json"),
      JSON.stringify({
        version: 1,
        notifications: [
          storedRow("toast", "activity"),
          storedRow("failure", "attention"),
          storedRow("notice", "announcement"),
        ],
      }),
      "utf8",
    );
    expect((await log.list()).map((item) => item.id)).toEqual(["failure"]);
  });

  it("serializes concurrent posts", async () => {
    const { log } = await setup();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => log.post(post(`n${index}`))),
    );
    expect(await log.list()).toHaveLength(20);
  });
});

function notificationAt(index: number, read: boolean): InboxNotification {
  return {
    id: `n${index}`,
    kind: "activity",
    priority: false,
    title: "Title",
    createdAt: index,
    updatedAt: index,
    readAt: read ? index : undefined,
  };
}

describe("capNotifications", () => {
  it("drops the oldest read notifications first", () => {
    const items = [
      notificationAt(0, false),
      notificationAt(1, true),
      ...Array.from({ length: NOTIFICATION_CAP }, (_, index) =>
        notificationAt(index + 2, false),
      ),
    ];
    const capped = capNotifications(items);
    expect(capped).toHaveLength(NOTIFICATION_CAP);
    const ids = new Set(capped.map((entry) => entry.id));
    expect(ids.has("n1")).toBe(false);
    expect(ids.has("n0")).toBe(false);
    expect(ids.has("n2")).toBe(true);
  });
});
