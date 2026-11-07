import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializePondSchema } from "../../db";
import { createPendingTasks } from "../pipeline/enqueue-scheduling";
import { archiveSiteForSave, startArchiveBackfill } from "./archive-backfill";

describe("archive backfill", () => {
  it("does not queue archives when automatic archiving is off", async () => {
    const autoArchive = vi.fn(async () => false);

    await expect(startArchiveBackfill(autoArchive)).resolves.toEqual({
      ok: true,
      queued: 0,
    });
    expect(autoArchive).toHaveBeenCalled();
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

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...eventsSchema } }),
    { $raw: sqlite },
  );
  const runtime = {
    getDb: async () => db,
    kickReconciler: vi.fn(),
    async persistSave(id: string, patch: Partial<schema.NewSave>) {
      db.update(schema.saves).set(patch).where(eq(schema.saves.id, id)).run();
      return null;
    },
  };
  const saveId = "archive-save";
  db.insert(schema.saves)
    .values({
      id: saveId,
      source: "web",
      sourceId: saveId,
      url: "https://example.com/",
      status: "complete",
    })
    .run();
  db.insert(schema.tasks)
    .values(
      createPendingTasks(saveId, "web", new Date(1), undefined).map(
        (task): schema.NewTask => ({
          ...task,
          status: task.op === "fetch_blobs" ? "dead" : "done",
        }),
      ),
    )
    .run();
  return { db, runtime, saveId };
}

describe.skipIf(!nativeSqliteAvailable())("archive task recovery", () => {
  it("leaves a complete Save alone when an earlier download failed", async () => {
    const { db, runtime, saveId } = setup();

    expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
      ok: true,
      queued: 0,
    });
    expect(runtime.kickReconciler).not.toHaveBeenCalled();
    expect(
      db.select().from(schema.saves).where(eq(schema.saves.id, saveId)).get()
        ?.status,
    ).toBe("complete");
    expect(
      db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.op, "archive_page"))
        .get()?.status,
    ).toBe("done");
  });

  it.each([
    { op: "fetch_blobs", status: "cancelled" },
    { op: "archive_page", status: "cancelled" },
    { op: "finalize", status: "cancelled" },
    { op: "archive_page", status: "dead" },
  ] as const)("preserves user cancellation of $op ($status)", async (task) => {
    const { db, runtime, saveId } = setup();
    db.update(schema.saves)
      .set({ status: "failed" })
      .where(eq(schema.saves.id, saveId))
      .run();
    db.update(schema.tasks).set({ status: "done" }).run();
    db.update(schema.tasks)
      .set({ status: task.status, lastError: schema.CANCEL_REASON })
      .where(eq(schema.tasks.op, task.op))
      .run();
    const before = db.select().from(schema.tasks).all();

    expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
      ok: true,
      queued: 0,
    });
    expect(runtime.kickReconciler).not.toHaveBeenCalled();
    expect(db.select().from(schema.tasks).all()).toEqual(before);
    expect(
      db.select().from(schema.saves).where(eq(schema.saves.id, saveId)).get()
        ?.status,
    ).toBe("failed");
  });

  it.each([
    { generationStatus: "paused", taskStatus: "pending" },
    { generationStatus: "paused", taskStatus: "dead" },
    { generationStatus: "cancelling", taskStatus: "deferred" },
    { generationStatus: "cancelled", taskStatus: "pending" },
  ] as const)(
    "preserves $taskStatus archive work in a $generationStatus batch",
    async ({ generationStatus, taskStatus }) => {
      const { db, runtime, saveId } = setup();
      db.update(schema.saves)
        .set({ status: "failed" })
        .where(eq(schema.saves.id, saveId))
        .run();
      db.insert(schema.queueGenerations)
        .values({ id: "retry", kind: "retry", status: generationStatus })
        .run();
      db.update(schema.tasks).set({ status: "done" }).run();
      db.update(schema.tasks)
        .set({ status: taskStatus, generationId: "retry" })
        .where(eq(schema.tasks.op, "archive_page"))
        .run();
      const before = db.select().from(schema.tasks).all();

      expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
        ok: true,
        queued: 0,
      });
      expect(runtime.kickReconciler).not.toHaveBeenCalled();
      expect(db.select().from(schema.tasks).all()).toEqual(before);
      expect(
        db.select().from(schema.saves).where(eq(schema.saves.id, saveId)).get()
          ?.status,
      ).toBe("failed");
    },
  );

  it("preserves a cancellation made while another Save is persisted", async () => {
    const { db, runtime, saveId } = setup();
    const laterSaveId = "later-save";
    db.update(schema.tasks).set({ status: "done" }).run();
    db.insert(schema.saves)
      .values({
        id: laterSaveId,
        source: "web",
        sourceId: laterSaveId,
        url: "https://example.com/later",
        status: "complete",
      })
      .run();
    db.insert(schema.tasks)
      .values(
        createPendingTasks(laterSaveId, "web", new Date(1), undefined).map(
          (task): schema.NewTask => ({ ...task, status: "done" }),
        ),
      )
      .run();
    const persist = runtime.persistSave;
    const persisted: string[] = [];
    let cancelledSaveId = "";
    runtime.persistSave = async (id, patch) => {
      persisted.push(id);
      const result = await persist(id, patch);
      cancelledSaveId = id === saveId ? laterSaveId : saveId;
      db.update(schema.tasks)
        .set({ status: "cancelled", lastError: schema.CANCEL_REASON })
        .where(eq(schema.tasks.saveId, cancelledSaveId))
        .run();
      return result;
    };

    expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
      ok: true,
      queued: 1,
    });
    expect(persisted).toHaveLength(1);
    const cancelledTasks = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.saveId, cancelledSaveId))
      .all();
    expect(cancelledTasks).toHaveLength(5);
    expect(cancelledTasks.every((task) => task.status === "cancelled")).toBe(
      true,
    );
    expect(
      db
        .select()
        .from(schema.saves)
        .where(eq(schema.saves.id, cancelledSaveId))
        .get()?.status,
    ).toBe("complete");
  });

  it("retries the failed download when a site archive is requested", async () => {
    const { db, runtime, saveId } = setup();

    expect(await archiveSiteForSave(saveId, runtime)).toEqual({ ok: true });
    expect(runtime.kickReconciler).toHaveBeenCalledOnce();
    expect(
      db.select().from(schema.saves).where(eq(schema.saves.id, saveId)).get()
        ?.status,
    ).toBe("ingesting");
    const rows = db.select().from(schema.tasks).all();
    expect(rows.find((task) => task.op === "fetch_blobs")?.status).toBe(
      "pending",
    );
    expect(rows.find((task) => task.op === "archive_page")).toMatchObject({
      status: "pending",
      payload: { scope: "site" },
    });
    expect(rows.find((task) => task.op === "finalize")?.status).toBe("pending");
    expect(rows.find((task) => task.op === "harvest_metadata")?.status).toBe(
      "done",
    );
  });
});
