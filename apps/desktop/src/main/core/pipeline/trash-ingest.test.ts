import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Op, queueGenerations, SKIP_REASON, tasks } from "@pond/schema/db";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { app } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import { clearUnfinishedDownloads } from "../clear-unfinished-downloads";
import { executeBatch } from "../executor";
import { clearUndoHistory, recordBatchForUndo, undo } from "../undo";
import { trackRunningIngest } from "./running-ingest";
import { claimDueTasks, ingestLeaseStillRunnable } from "./task-queue";

/**
 * Loading the reconciler installs the trash handler, the same way app startup does.
 * The import is the production wiring this regression depends on.
 */
import "./reconciler";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

async function raw(): Promise<Database.Database> {
  return (await getDb()).$raw;
}

async function seedSave(
  id: string,
  status = "ingesting",
  deletedAt: number | null = null,
): Promise<void> {
  await (await raw())
    .prepare(
      `INSERT INTO saves (id, source, source_id, url, status, deleted_at)
      VALUES (?, 'web', ?, ?, ?, ?)`,
    )
    .run(id, id, `https://example.com/${id}`, status, deletedAt);
}

async function seedTask(
  id: string,
  saveId: string,
  op: Op,
  status = "pending",
  generationId: string | null = null,
  running = false,
): Promise<void> {
  await (await raw())
    .prepare(
      `INSERT INTO tasks (
        id, save_id, source, op, status, generation_id, cancellation_fence,
        lease_owner, lease_token, lease_expires_at, next_run_at, created_at
      ) VALUES (?, ?, 'web', ?, ?, ?, 0, ?, ?, ?, 0, 0)`,
    )
    .run(
      id,
      saveId,
      op,
      status,
      generationId,
      running ? "owner" : null,
      running ? `lease-${id}` : null,
      running ? Date.now() + 60_000 : null,
    );
}

async function seedGeneration(id: string): Promise<void> {
  await (await raw())
    .prepare(
      `INSERT INTO queue_generations (id, kind, status, created_at, updated_at)
      VALUES (?, 'sync', 'active', 1, 1)`,
    )
    .run(id);
}

async function taskStatus(id: string): Promise<string | undefined> {
  const row = await (await getDb())
    .select({ status: tasks.status, generationId: tasks.generationId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .get();
  return row?.status;
}

async function taskGeneration(id: string): Promise<string | null | undefined> {
  const row = await (await getDb())
    .select({ generationId: tasks.generationId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .get();
  return row?.generationId;
}

async function generationStatus(id: string): Promise<string | undefined> {
  const row = await (await getDb())
    .select({ status: queueGenerations.status })
    .from(queueGenerations)
    .where(eq(queueGenerations.id, id))
    .get();
  return row?.status;
}

function claimOpenTasks() {
  return claimDueTasks({
    owner: "test",
    limit: 10,
    availableInteractive: 0,
    availableBackground: 4,
    availableByOp: {
      render_text_cover: 4,
      fetch_blobs: 4,
      archive_page: 4,
    },
  });
}

function trashTransaction(id: string) {
  return {
    kind: "trash" as const,
    model: "save" as const,
    id,
    meta: { actor: "user" as const, actorReason: "test:trash" },
  };
}

describe.skipIf(!nativeSqliteAvailable())(
  "trashing a download stops its import",
  () => {
    let dir = "";

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "pond-trash-ingest-"));
      vi.spyOn(app, "getPath").mockReturnValue(dir);
      invalidatePaths();
      resolvePaths(join(dir, "Trash Ingest.pond"));
    });

    afterAll(() => {
      clearUndoHistory();
      closeDb();
      vi.restoreAllMocks();
      invalidatePaths();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        if (process.platform !== "win32") throw error;
      }
    });

    it("does not claim tasks for a save that is already in Trash", async () => {
      await seedSave("hidden", "ingesting", Date.now());
      await seedTask("hidden-task", "hidden", "render_text_cover");
      await seedTask(
        "hidden-running",
        "hidden",
        "fetch_blobs",
        "running",
        null,
        true,
      );
      await seedSave("visible");
      await seedTask("visible-task", "visible", "render_text_cover");
      const hiddenRunning = await (await getDb())
        .select()
        .from(tasks)
        .where(eq(tasks.id, "hidden-running"))
        .get();
      if (!hiddenRunning) throw new Error("missing hidden task");

      const claimed = await claimOpenTasks();

      expect(claimed.map((task) => task.saveId)).not.toContain("hidden");
      expect(claimed.map((task) => task.saveId)).toContain("visible");
      expect(await ingestLeaseStillRunnable(hiddenRunning)).toBe(false);
    });

    it("cancels open tasks when one in-progress download is trashed and resumes them on Undo", async () => {
      await seedSave("neighbor");
      await seedTask("neighbor-task", "neighbor", "render_text_cover");
      await seedSave("moving");
      await seedTask("moving-cover", "moving", "render_text_cover");
      await seedTask(
        "moving-media",
        "moving",
        "fetch_blobs",
        "running",
        null,
        true,
      );
      await seedTask("moving-archive", "moving", "archive_page");
      const running = new AbortController();
      trackRunningIngest("moving-media", running);
      const transaction = trashTransaction("moving");

      await executeBatch([transaction]);
      recordBatchForUndo([transaction]);

      expect(running.signal.aborted).toBe(true);
      expect(await taskStatus("moving-cover")).toBe("cancelled");
      expect(await taskStatus("moving-media")).toBe("cancelled");
      expect(await taskStatus("moving-archive")).toBe("cancelled");
      expect(await taskStatus("neighbor-task")).toBe("pending");
      const claimedWhileTrashed = (await claimOpenTasks()).map(
        (task) => task.saveId,
      );
      expect(claimedWhileTrashed).toContain("neighbor");
      expect(claimedWhileTrashed).not.toContain("moving");

      expect(await undo()).toBe(true);
      expect(await taskStatus("moving-cover")).toBe("pending");
      expect(await taskStatus("moving-media")).toBe("pending");
      expect(await taskStatus("moving-archive")).toBe("pending");
      expect((await claimOpenTasks()).map((task) => task.id)).toContain(
        "moving-cover",
      );
    });

    it("cancels import work when Clear unfinished downloads trashes every ingesting save", async () => {
      await seedSave("clear-running");
      await seedTask(
        "clear-running-task",
        "clear-running",
        "render_text_cover",
      );
      await seedSave("clear-done", "complete");
      await seedTask("clear-done-task", "clear-done", "render_text_cover");
      await seedSave("clear-failed", "failed");
      await seedSave("clear-skipped", "skipped");
      await seedTask(
        "clear-skipped-task",
        "clear-skipped",
        "render_text_cover",
        "cancelled",
      );
      await (await raw())
        .prepare("UPDATE tasks SET last_error = ? WHERE id = ?")
        .run(SKIP_REASON, "clear-skipped-task");

      const result = await clearUnfinishedDownloads(
        await getDb(),
        async (transactions) => {
          await executeBatch(transactions);
        },
        recordBatchForUndo,
      );

      expect(result.ids).toEqual(
        expect.arrayContaining([
          "clear-running",
          "clear-failed",
          "clear-skipped",
        ]),
      );
      expect(result.ids).not.toContain("clear-done");
      expect(await taskStatus("clear-running-task")).toBe("cancelled");
      expect(await taskStatus("clear-done-task")).toBe("pending");
      expect(await taskStatus("clear-skipped-task")).toBe("cancelled");

      expect(await undo()).toBe(true);
      expect(await taskStatus("clear-running-task")).toBe("pending");
      expect(await taskStatus("clear-skipped-task")).toBe("cancelled");
      expect((await claimOpenTasks()).map((task) => task.id)).toContain(
        "clear-running-task",
      );
    });

    it("lets a batch finish when its last open save is trashed and requeues that save outside the finished batch", async () => {
      await seedGeneration("batch");
      await seedSave("batch-a");
      await seedSave("batch-b");
      await seedTask(
        "batch-a-task",
        "batch-a",
        "render_text_cover",
        "pending",
        "batch",
      );
      await seedTask(
        "batch-b-task",
        "batch-b",
        "render_text_cover",
        "pending",
        "batch",
      );

      await executeBatch([trashTransaction("batch-a")]);

      expect(await taskStatus("batch-a-task")).toBe("cancelled");
      expect(await generationStatus("batch")).toBe("active");

      await executeBatch([
        {
          kind: "untrash",
          model: "save",
          id: "batch-a",
          meta: { actor: "user", actorReason: "test:untrash" },
        },
      ]);
      expect(await taskStatus("batch-a-task")).toBe("pending");
      expect(await taskGeneration("batch-a-task")).toBe("batch");

      await executeBatch([
        trashTransaction("batch-a"),
        trashTransaction("batch-b"),
      ]);

      expect(await generationStatus("batch")).toBe("done");
      await executeBatch([
        {
          kind: "untrash",
          model: "save",
          id: "batch-b",
          meta: { actor: "user", actorReason: "test:untrash" },
        },
      ]);
      expect(await taskStatus("batch-b-task")).toBe("pending");
      expect(await taskGeneration("batch-b-task")).toBeNull();
      expect(await generationStatus("batch")).toBe("done");
      expect((await claimOpenTasks()).map((task) => task.id)).toContain(
        "batch-b-task",
      );
    });
  },
);
