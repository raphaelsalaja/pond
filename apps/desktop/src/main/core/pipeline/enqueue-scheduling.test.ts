import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializePondSchema } from "../../db";
import { createPendingTasks, rependArchiveTasks } from "./enqueue-scheduling";
import { isInteractiveTask } from "./priority";

describe("createPendingTasks", () => {
  it("preserves planned operation order and interactive priority", () => {
    const now = new Date(1);
    let nextId = 0;
    const rows = createPendingTasks(
      "save-id",
      "web",
      now,
      "toolbar",
      () => `task-${nextId++}`,
    );

    expect(rows.map((row) => row.op)).toEqual([
      "harvest_metadata",
      "render_text_cover",
      "fetch_blobs",
      "archive_page",
      "finalize",
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      "task-0",
      "task-1",
      "task-2",
      "task-3",
      "task-4",
    ]);
    expect(
      rows.every((row) => isInteractiveTask({ payload: row.payload ?? null })),
    ).toBe(true);
    expect(rows.every((row) => row.nextRunAt === now)).toBe(true);
  });

  it("keeps background tasks unprioritized and local saves taskless", () => {
    const background = createPendingTasks(
      "save-id",
      "twitter",
      new Date(1),
      "sync:twitter",
    );

    expect(background.every((row) => row.payload == null)).toBe(true);
    expect(
      createPendingTasks("local-id", "local", new Date(1), "toolbar"),
    ).toEqual([]);
  });
});

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const databases: Database.Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function archiveTasks(statuses: readonly schema.TaskStatus[]) {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...eventsSchema } }),
    { $raw: sqlite },
  );
  const at = new Date(1);
  db.insert(schema.saves)
    .values({
      id: "web-save",
      source: "web",
      sourceId: "web-save",
      url: "https://example.com/",
      status: "complete",
    })
    .run();
  db.insert(schema.queueGenerations)
    .values({ id: "old-generation", kind: "retry", status: "done" })
    .run();
  db.insert(schema.tasks)
    .values(
      createPendingTasks("web-save", "web", at, undefined).map(
        (task, index) => ({
          ...task,
          status: statuses[index] ?? "done",
          attempts: 3,
          generationId: "old-generation",
          cancellationFence: 2,
          deferredReason: "retry_backoff" as const,
          leaseOwner: "old-worker",
          leaseToken: "old-lease",
          leaseExpiresAt: at,
          heartbeatAt: at,
          startedAt: at,
          failedAt: at,
          completedAt: at,
          lastError: "Previous attempt failed",
        }),
      ),
    )
    .run();
  return {
    db,
    read: () =>
      db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.saveId, "web-save"))
        .all(),
  };
}

describe.skipIf(!nativeSqliteAvailable())("rependArchiveTasks", () => {
  it("retries failed prerequisites and clears stale task state", () => {
    const { db, read } = archiveTasks([
      "done",
      "blocked",
      "dead",
      "done",
      "done",
    ]);
    const before = read();
    const at = new Date(100);

    expect(rependArchiveTasks(db, "web-save", at)).toBe(true);

    const after = read();
    expect(after.find((task) => task.op === "harvest_metadata")).toEqual(
      before.find((task) => task.op === "harvest_metadata"),
    );
    const restarted = after.filter((task) => task.op !== "harvest_metadata");
    expect(restarted).toHaveLength(4);
    for (const task of restarted) {
      expect(task).toMatchObject({
        status: "pending",
        attempts: 0,
        generationId: null,
        cancellationFence: 3,
        deferredReason: null,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: null,
        failedAt: null,
        completedAt: null,
        lastError: null,
        nextRunAt: at,
        updatedAt: at,
      });
    }
  });

  it("preserves completed and cancelled prerequisite tasks", () => {
    const { db, read } = archiveTasks([
      "done",
      "done",
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    const before = read();

    expect(rependArchiveTasks(db, "web-save", new Date(100))).toBe(true);

    const after = read();
    for (const op of ["harvest_metadata", "render_text_cover", "fetch_blobs"]) {
      expect(after.find((task) => task.op === op)).toEqual(
        before.find((task) => task.op === op),
      );
    }
    expect(after.find((task) => task.op === "archive_page")?.status).toBe(
      "pending",
    );
    expect(after.find((task) => task.op === "finalize")?.status).toBe(
      "pending",
    );
  });

  it("does not change a Save's tasks while one task is running", () => {
    const { db, read } = archiveTasks([
      "done",
      "done",
      "dead",
      "running",
      "done",
    ]);
    const before = read();

    expect(rependArchiveTasks(db, "web-save", new Date(100))).toBe(false);
    expect(read()).toEqual(before);
  });
});
