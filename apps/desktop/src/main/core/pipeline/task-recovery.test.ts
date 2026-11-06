import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANCEL_REASON } from "@pond/schema/db";
import { syncConfigFor } from "@pond/schema/sources";
import Database from "better-sqlite3";
import { app } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import {
  createRetryGeneration,
  setQueueGenerationPaused,
} from "./queue-generations";
import {
  claimSourceProbe,
  recordSourceRequest,
  withSourceTaskLease,
} from "./source-admission";
import { claimDueTasks, sweepOrphanTasks } from "./task-queue";
import { markDone } from "./task-settlement";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("download recovery", () => {
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pond-task-recovery-"));
    vi.spyOn(app, "getPath").mockReturnValue(directory);
    invalidatePaths();
    resolvePaths(join(directory, "Recovery.pond"));
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
    invalidatePaths();
    rmSync(directory, { recursive: true, force: true });
  });

  async function seedFailedSave(id: string): Promise<void> {
    const { $raw } = await getDb();
    $raw
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
      VALUES (?, 'web', ?, ?, 'failed')`,
      )
      .run(id, id, `https://example.com/${id}`);
    $raw
      .prepare(
        `INSERT INTO tasks (
        id, save_id, source, op, status, max_attempts, last_error
      ) VALUES (?, ?, 'web', 'harvest_metadata', 'dead', 5, 'network failed')`,
      )
      .run(`task-${id}`, id);
  }

  function claim() {
    return claimDueTasks({
      owner: "test",
      limit: 1,
      availableInteractive: 0,
      availableBackground: 1,
      availableByOp: { harvest_metadata: 1 },
    });
  }

  it("keeps retries queued until a failed Save receives a worker", async () => {
    await seedFailedSave("first");
    await seedFailedSave("second");
    expect((await createRetryGeneration()).queued).toBe(2);

    await sweepOrphanTasks();
    const { $raw } = await getDb();
    expect($raw.prepare("SELECT status FROM tasks").all()).toEqual([
      { status: "pending" },
      { status: "pending" },
    ]);

    const claimed = await claim();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe("running");
    expect(
      $raw.prepare("SELECT status FROM saves ORDER BY status").all(),
    ).toEqual([{ status: "failed" }, { status: "ingesting" }]);
  });

  it("preserves paused retries and removes unrelated orphan tasks", async () => {
    await seedFailedSave("retry");
    const retry = await createRetryGeneration(["retry"]);
    if (!retry.generationId) throw new Error("missing retry generation");
    await setQueueGenerationPaused(retry.generationId, true);
    await seedFailedSave("orphan");
    const { $raw } = await getDb();
    $raw
      .prepare("UPDATE tasks SET status = 'pending' WHERE save_id = 'orphan'")
      .run();

    await sweepOrphanTasks();
    expect(await claim()).toEqual([]);
    expect(
      $raw.prepare("SELECT id, status FROM tasks ORDER BY id").all(),
    ).toEqual([
      { id: "task-orphan", status: "dead" },
      { id: "task-retry", status: "pending" },
    ]);

    await setQueueGenerationPaused(retry.generationId, false);
    expect((await claim()).map((task) => task.saveId)).toEqual(["retry"]);
  });

  it("retries blocked and failed tasks for Saves still marked as ingesting", async () => {
    await seedFailedSave("blocked");
    await seedFailedSave("partial");
    await seedFailedSave("cancelled");
    const { $raw } = await getDb();
    $raw.prepare("UPDATE saves SET status = 'ingesting'").run();
    $raw
      .prepare("UPDATE tasks SET status = 'blocked' WHERE save_id = 'blocked'")
      .run();
    $raw
      .prepare(
        "UPDATE tasks SET status = 'cancelled' WHERE save_id = 'cancelled'",
      )
      .run();

    expect((await createRetryGeneration()).queued).toBe(2);
    expect(
      $raw.prepare("SELECT id, status FROM tasks ORDER BY id").all(),
    ).toEqual([
      { id: "task-blocked", status: "pending" },
      { id: "task-cancelled", status: "cancelled" },
      { id: "task-partial", status: "pending" },
    ]);
    expect(await claim()).toHaveLength(1);
  });

  it("moves pending and deferred tasks out of a paused batch when a Save is retried", async () => {
    await seedFailedSave("paused-save");
    const { $raw } = await getDb();
    $raw
      .prepare(
        "INSERT INTO queue_generations (id, kind, status) VALUES ('old-batch', 'refresh', 'paused')",
      )
      .run();
    $raw.prepare("UPDATE saves SET status = 'ingesting'").run();
    $raw
      .prepare(
        "UPDATE tasks SET status = 'blocked', generation_id = 'old-batch'",
      )
      .run();
    $raw
      .prepare(
        `INSERT INTO tasks (id, save_id, source, op, status, generation_id)
      VALUES
        ('media', 'paused-save', 'web', 'fetch_blobs', 'pending', 'old-batch'),
        ('poster', 'paused-save', 'web', 'ensure_poster', 'deferred', 'old-batch')`,
      )
      .run();

    const retried = await createRetryGeneration(["paused-save"]);
    expect(retried.queued).toBe(1);
    expect(
      $raw.prepare("SELECT generation_id, status FROM tasks").all(),
    ).toEqual([
      { generation_id: retried.generationId, status: "pending" },
      { generation_id: retried.generationId, status: "pending" },
      { generation_id: retried.generationId, status: "pending" },
    ]);
    const [harvest] = await claim();
    if (!harvest) throw new Error("harvest was not claimed");
    expect(await markDone(harvest)).toBe(true);
    const next = await claimDueTasks({
      owner: "test",
      limit: 1,
      availableInteractive: 0,
      availableBackground: 1,
      availableByOp: { fetch_blobs: 1 },
    });
    expect(next.map((task) => task.id)).toEqual(["media"]);
  });

  it.each([
    { status: "done", error: null },
    { status: "running", error: null },
    { status: "cancelled", error: null },
    { status: "dead", error: CANCEL_REASON },
    { status: "pending", error: CANCEL_REASON },
  ])(
    "preserves a $status peer with error $error during explicit retry",
    async ({ status, error }) => {
      await seedFailedSave("retry");
      const { $raw } = await getDb();
      $raw
        .prepare(
          "INSERT INTO queue_generations (id, kind, status) VALUES ('old-batch', 'refresh', 'paused')",
        )
        .run();
      $raw
        .prepare(
          `INSERT INTO tasks (id, save_id, source, op, status, last_error, generation_id)
      VALUES ('preserved', 'retry', 'web', 'fetch_blobs', ?, ?, 'old-batch')`,
        )
        .run(status, error);

      expect((await createRetryGeneration(["retry"])).queued).toBe(1);
      expect(
        $raw
          .prepare(
            "SELECT status, last_error, generation_id FROM tasks WHERE id = 'preserved'",
          )
          .get(),
      ).toEqual({
        status,
        last_error: error,
        generation_id: "old-batch",
      });
    },
  );

  it("admits the recovery probe request and blocks other source requests", async () => {
    const { $raw } = await getDb();
    const at = Date.now();
    $raw
      .prepare(
        `INSERT INTO source_gates (source, state, reason, retry_at, updated_at)
      VALUES ('twitter', 'open', 'transient_failures', ?, ?)`,
      )
      .run(at - 1, at);
    expect(claimSourceProbe($raw, "twitter", "probe", at + 60_000, at)).toBe(
      true,
    );

    expect((await recordSourceRequest("twitter")).admitted).toBe(false);
    await withSourceTaskLease("probe", async () => {
      await Promise.resolve();
      expect((await recordSourceRequest("twitter")).admitted).toBe(true);
      expect(
        (
          await withSourceTaskLease("other", () =>
            recordSourceRequest("twitter"),
          )
        ).admitted,
      ).toBe(false);
    });
    expect((await recordSourceRequest("twitter")).admitted).toBe(false);
    expect(
      $raw.prepare("SELECT COUNT(*) AS count FROM source_request_ledger").get(),
    ).toEqual({ count: 1 });
    $raw
      .prepare(
        `INSERT INTO source_request_ledger (source, requested_at, permits)
      VALUES ('twitter', ?, ?)`,
      )
      .run(at, syncConfigFor("twitter").rate.maxPerHour);
    expect(
      await withSourceTaskLease("probe", () => recordSourceRequest("twitter")),
    ).toMatchObject({ admitted: false, reason: "source_budget" });
  });
});
