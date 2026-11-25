import { CANCEL_REASON, queueGenerations, saves, tasks } from "@pond/schema/db";
import type { NewSave, NewTask } from "@pond/schema/db";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wrapSqlite } from "../../database/client";
import { initializePondSchema } from "../../db";
import { createPendingTasks } from "../pipeline/enqueue-scheduling";
import { archiveSiteForSave, startArchiveBackfill } from "./archive-backfill";

describe("archive backfill", () => {
  it("does not queue archives when automatic archiving is off", async () => {
    let asked = 0;
    const autoArchive = async () => {
      asked += 1;
      return false;
    };

    await expect(startArchiveBackfill(autoArchive)).resolves.toEqual({
      ok: true,
      queued: 0,
    });
    expect(asked).toBeGreaterThan(0);
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

const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const runtime = {
    getDb: async () => db,
    kickReconciler: vi.fn(),
    async persistSave(id: string, patch: Partial<NewSave>) {
      db.update(saves).set(patch).where(eq(saves.id, id)).run();
      return null;
    },
  };
  const saveId = "archive-save";
  db.insert(saves)
    .values({
      id: saveId,
      source: "web",
      sourceId: saveId,
      url: "https://example.com/",
      status: "complete",
    })
    .run();
  db.insert(tasks)
    .values(
      createPendingTasks(saveId, "web", new Date(1), undefined).map(
        (task): NewTask => ({
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
      db.select().from(saves).where(eq(saves.id, saveId)).get()?.status,
    ).toBe("complete");
    expect(
      db.select().from(tasks).where(eq(tasks.op, "archive_page")).get()?.status,
    ).toBe("done");
  });

  it.each([
    { op: "fetch_blobs", status: "cancelled" },
    { op: "archive_page", status: "cancelled" },
    { op: "finalize", status: "cancelled" },
    { op: "archive_page", status: "dead" },
  ] as const)("preserves user cancellation of $op ($status)", async (task) => {
    const { db, runtime, saveId } = setup();
    db.update(saves)
      .set({ status: "failed" })
      .where(eq(saves.id, saveId))
      .run();
    db.update(tasks).set({ status: "done" }).run();
    db.update(tasks)
      .set({ status: task.status, lastError: CANCEL_REASON })
      .where(eq(tasks.op, task.op))
      .run();
    const before = db.select().from(tasks).all();

    expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
      ok: true,
      queued: 0,
    });
    expect(runtime.kickReconciler).not.toHaveBeenCalled();
    expect(db.select().from(tasks).all()).toEqual(before);
    expect(
      db.select().from(saves).where(eq(saves.id, saveId)).get()?.status,
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
      db.update(saves)
        .set({ status: "failed" })
        .where(eq(saves.id, saveId))
        .run();
      db.insert(queueGenerations)
        .values({ id: "retry", kind: "retry", status: generationStatus })
        .run();
      db.update(tasks).set({ status: "done" }).run();
      db.update(tasks)
        .set({ status: taskStatus, generationId: "retry" })
        .where(eq(tasks.op, "archive_page"))
        .run();
      const before = db.select().from(tasks).all();

      expect(await startArchiveBackfill(async () => true, runtime)).toEqual({
        ok: true,
        queued: 0,
      });
      expect(runtime.kickReconciler).not.toHaveBeenCalled();
      expect(db.select().from(tasks).all()).toEqual(before);
      expect(
        db.select().from(saves).where(eq(saves.id, saveId)).get()?.status,
      ).toBe("failed");
    },
  );

  it("preserves a cancellation made while another Save is persisted", async () => {
    const { db, runtime, saveId } = setup();
    const laterSaveId = "later-save";
    db.update(tasks).set({ status: "done" }).run();
    db.insert(saves)
      .values({
        id: laterSaveId,
        source: "web",
        sourceId: laterSaveId,
        url: "https://example.com/later",
        status: "complete",
      })
      .run();
    db.insert(tasks)
      .values(
        createPendingTasks(laterSaveId, "web", new Date(1), undefined).map(
          (task): NewTask => ({ ...task, status: "done" }),
        ),
      )
      .run();
    const persist = runtime.persistSave;
    const persisted: Array<string> = [];
    let cancelledSaveId = "";
    runtime.persistSave = async (id, patch) => {
      persisted.push(id);
      const result = await persist(id, patch);
      cancelledSaveId = id === saveId ? laterSaveId : saveId;
      db.update(tasks)
        .set({ status: "cancelled", lastError: CANCEL_REASON })
        .where(eq(tasks.saveId, cancelledSaveId))
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
      .from(tasks)
      .where(eq(tasks.saveId, cancelledSaveId))
      .all();
    expect(cancelledTasks).toHaveLength(5);
    expect(cancelledTasks.every((task) => task.status === "cancelled")).toBe(
      true,
    );
    expect(
      db.select().from(saves).where(eq(saves.id, cancelledSaveId)).get()
        ?.status,
    ).toBe("complete");
  });

  it("retries the failed download when a site archive is requested", async () => {
    const { db, runtime, saveId } = setup();

    expect(await archiveSiteForSave(saveId, runtime)).toEqual({ ok: true });
    expect(runtime.kickReconciler).toHaveBeenCalledOnce();
    expect(
      db.select().from(saves).where(eq(saves.id, saveId)).get()?.status,
    ).toBe("ingesting");
    const rows = db.select().from(tasks).all();
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
