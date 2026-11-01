import { CANCEL_REASON, OPS, SKIP_REASON, saves, tasks } from "@pond/schema/db";
import type {
  PipelineTaskAttemptEvent,
  PipelineTaskEvent,
} from "@pond/schema/events";
import { and, eq, inArray, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { getDb } from "../../db";
import { commitEvent, startTaskEvent, toErrorInfo } from "../../lib/wide-event";
import { registerTrashIngestHandler } from "../executor";
import { persistSave } from "../persist-save";
import { downloadActivity } from "./download-activity";
import { canDispatchTask, isInteractiveTask } from "./priority";
import {
  cancelQueueGeneration,
  completeQueueGenerationIfSettled,
} from "./queue-generations";
import { noteSuccess } from "./rate-governor";
import {
  type DueTask,
  isSourceTask,
  MAX_BACKGROUND_INFLIGHT,
  MAX_GLOBAL_INFLIGHT,
  MAX_INTERACTIVE_INFLIGHT,
  metrics,
  ORPHAN_SWEEP_INTERVAL_MS,
  PER_OP_CONCURRENCY,
  POLL_INTERVAL_MS,
  TASK_WATCHDOG_MS,
  WORKERS,
  WorkerWatchdogError,
} from "./reconciler-config";
import {
  abortRunningIngest,
  trackRunningIngest,
  untrackRunningIngest,
} from "./running-ingest";
import {
  claimDueTasks,
  extendOwnedLeasesSync,
  heartbeatTaskLease,
  ingestLeaseStillRunnable,
  recoverExpiredLeases,
  sweepOrphanTasks,
  sweepTasklessIngestingSaves,
  TASK_LEASE_MS,
} from "./task-queue";
import {
  enrichTaskEventWithSave,
  gateForSource,
  handleFailure,
  markDone,
  maybeFinalizeSave,
} from "./task-settlement";
import {
  releaseTrashedIngestSync,
  resumeTrashedIngestSync,
} from "./trash-ingest";

const TaskPayloadSchema = z.json().catch(null);
const LEASE_OWNER = `main:${process.pid}`;

let started = false;
let paused = false;
let pausedBeforeSuspend = false;
let suspended = false;
let pollTimer: NodeJS.Timeout | null = null;
let kickPending = false;
let nextOrphanSweepAt = 0;
const inflightByOp = {
  harvest_metadata: 0,
  capture_tweet: 0,
  render_text_cover: 0,
  fetch_blobs: 0,
  archive_page: 0,
  fetch_video_ytdlp: 0,
  ensure_poster: 0,
  fetch_avatar: 0,
  finalize: 0,
};
let inflightGlobal = 0;
let inflightInteractive = 0;
const runningTaskIds = new Set<string>();
const pendingWork = new Set<Promise<unknown>>();
function track<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    () => {},
    () => {},
  );
  pendingWork.add(settled);
  void settled.then(() => pendingWork.delete(settled));
  return work;
}
export async function pauseAndDrainReconciler(
  timeoutMs = 60_000,
): Promise<boolean> {
  const wasPaused = paused;
  pauseReconciler();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      (async () => {
        while (pendingWork.size) await Promise.all(pendingWork);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Background saves are still finishing. Try the library operation again shortly.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
    return wasPaused;
  } catch (error) {
    if (!wasPaused) resumeReconciler();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isReconcilerPaused(): boolean {
  return paused;
}

export interface PipelineSnapshot {
  paused: boolean;
  inflight: number;
}

export function pipelineSnapshot(): PipelineSnapshot {
  return { paused, inflight: inflightGlobal };
}

export function pauseReconciler(): void {
  if (paused) return;
  paused = true;
  log.info("[pond pipeline:reconciler] paused");
}

export function resumeReconciler(): void {
  if (!paused) return;
  paused = false;
  log.info("[pond pipeline:reconciler] resumed");
  kickReconciler();
}

export async function suspendReconciler(): Promise<void> {
  if (suspended) return;
  suspended = true;
  pausedBeforeSuspend = paused;
  pauseReconciler();
  const db = await getDb();
  const at = Date.now();
  extendOwnedLeasesSync(db.$raw, LEASE_OWNER, at, false);
}

export async function resumeReconcilerAfterSuspend(): Promise<void> {
  if (!suspended) return;
  suspended = false;
  const db = await getDb();
  const at = Date.now();
  extendOwnedLeasesSync(db.$raw, LEASE_OWNER, at, true);
  if (!pausedBeforeSuspend) resumeReconciler();
}

export async function cancelSaveIngest(saveId: string): Promise<boolean> {
  const db = await getDb();
  const save = db
    .select({ status: saves.status })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get();
  if (save?.status !== "ingesting") return false;

  const running = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.saveId, saveId), eq(tasks.status, "running")))
    .all();
  for (const { id } of running) abortRunningIngest(id);

  db.update(tasks)
    .set({
      status: "cancelled",
      lastError: CANCEL_REASON,
      cancellationFence: sql`${tasks.cancellationFence} + 1`,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.saveId, saveId),
        inArray(tasks.status, ["pending", "deferred", "running", "blocked"]),
      ),
    )
    .run();

  await persistSave(
    saveId,
    { status: "failed" },
    { actorReason: "user:cancel-ingest" },
  );
  log.info("[pond pipeline:reconciler] cancelled save ingest", { saveId });
  return true;
}

export async function cancelSavesIngest(
  saveIds: readonly string[],
): Promise<number> {
  let cancelled = 0;
  for (const id of new Set(saveIds)) {
    if (await cancelSaveIngest(id)) cancelled += 1;
  }
  return cancelled;
}

export async function cancelAllIngest(): Promise<number> {
  const wasPaused = paused;
  pauseReconciler();
  const db = await getDb();
  const rows = db
    .select({ id: saves.id })
    .from(saves)
    .where(eq(saves.status, "ingesting"))
    .all();
  const cancelled = await cancelSavesIngest(rows.map((row) => row.id));
  if (!wasPaused) resumeReconciler();
  log.info("[pond pipeline:reconciler] cancelled all ingest", { cancelled });
  return cancelled;
}

export async function cancelGeneration(generationId: string): Promise<number> {
  const runningIds = await cancelQueueGeneration(generationId);
  for (const id of runningIds) abortRunningIngest(id);
  log.info("[pond pipeline:reconciler] cancelled generation", {
    generationId,
    running: runningIds.length,
  });
  return runningIds.length;
}

export async function skipSaves(ids: readonly string[]): Promise<number> {
  const db = await getDb();
  let skipped = 0;
  for (const saveId of ids) {
    const save = db
      .select({ status: saves.status, deletedAt: saves.deletedAt })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get();
    if (!save || save.deletedAt) continue;
    if (save.status === "skipped" || save.status === "complete") continue;

    const running = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.saveId, saveId), eq(tasks.status, "running")))
      .all();
    for (const { id } of running) abortRunningIngest(id);

    await persistSave(
      saveId,
      { status: "skipped" },
      { actorReason: "user:skip-ingest" },
    );
    db.update(tasks)
      .set({
        status: "cancelled",
        lastError: SKIP_REASON,
        cancellationFence: sql`${tasks.cancellationFence} + 1`,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.saveId, saveId),
          inArray(tasks.status, ["pending", "deferred", "running", "blocked"]),
        ),
      )
      .run();
    skipped += 1;
  }
  log.info("[pond pipeline:reconciler] skipped saves", { skipped });
  return skipped;
}

export function startReconciler(): void {
  if (started) return;
  started = true;
  log.info("[pond pipeline:reconciler] starting");
  void track(initializeReconciler()).catch((err) =>
    log.error("[pond pipeline:reconciler] initialization failed", err),
  );
}

export function kickReconciler(): void {
  if (!started) return;
  if (kickPending) return;
  kickPending = true;
  setImmediate(() => {
    kickPending = false;
    void track(tick());
  });
}

async function initializeReconciler(): Promise<void> {
  await recoverExpiredLeases();
  await releaseIngestForTrashedSaves(null);
  await sweepOrphanTasks();
  await sweepTasklessIngestingSaves();
  nextOrphanSweepAt = Date.now() + ORPHAN_SWEEP_INTERVAL_MS;
  schedulePoll(POLL_INTERVAL_MS);
  await tick();
}

function schedulePoll(ms: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (!started) return;
    void track(tick()).finally(() => schedulePoll(POLL_INTERVAL_MS));
  }, ms);
}

async function tick(): Promise<void> {
  if (!started || paused) return;
  if (Date.now() >= nextOrphanSweepAt) {
    nextOrphanSweepAt = Date.now() + ORPHAN_SWEEP_INTERVAL_MS;
    void track(sweepOrphanTasks()).catch((err) =>
      log.warn("[pond pipeline:reconciler] periodic orphan sweep failed", err),
    );
    void track(recoverExpiredLeases()).catch((err) =>
      log.warn(
        "[pond pipeline:reconciler] periodic lease recovery failed",
        err,
      ),
    );
    void track(sweepTasklessIngestingSaves()).catch((err) =>
      log.warn(
        "[pond pipeline:reconciler] periodic taskless sweep failed",
        err,
      ),
    );
    void track(releaseIngestForTrashedSaves(null)).catch((err) =>
      log.warn("[pond pipeline:reconciler] periodic trash sweep failed", err),
    );
  }
  const globalRoom = MAX_GLOBAL_INFLIGHT - inflightGlobal;
  if (globalRoom <= 0) return;
  const availableByOp = z
    .record(z.enum(OPS), z.number())
    .parse(
      Object.fromEntries(
        OPS.map((op) => [
          op,
          Math.max(0, PER_OP_CONCURRENCY[op] - inflightByOp[op]),
        ]),
      ),
    );
  const due = await claimDueTasks({
    owner: LEASE_OWNER,
    limit: globalRoom,
    availableInteractive: Math.max(
      0,
      MAX_INTERACTIVE_INFLIGHT - inflightInteractive,
    ),
    availableBackground: Math.max(
      0,
      MAX_BACKGROUND_INFLIGHT - (inflightGlobal - inflightInteractive),
    ),
    availableByOp,
  });
  if (due.length === 0) return;
  for (const task of due) {
    if (runningTaskIds.has(task.id)) continue;
    if (
      !canDispatchTask({
        interactive: isInteractiveTask(task),
        paused,
        inflightGlobal,
        inflightInteractive,
        inflightForOp: inflightByOp[task.op],
        opCap: PER_OP_CONCURRENCY[task.op],
        backgroundCap: MAX_BACKGROUND_INFLIGHT,
        interactiveCap: MAX_INTERACTIVE_INFLIGHT,
      })
    ) {
      continue;
    }
    void track(dispatchTask(task));
  }
}

async function dispatchTask(task: DueTask): Promise<void> {
  if (!task.leaseToken) return;
  const interactive = isInteractiveTask(task);
  runningTaskIds.add(task.id);
  inflightByOp[task.op]++;
  inflightGlobal++;
  if (interactive) inflightInteractive++;
  metrics.tasksDispatched++;
  const controller = new AbortController();
  trackRunningIngest(task.id, controller);
  const ev: PipelineTaskEvent = startTaskEvent({
    saveId: task.saveId,
    source: task.source,
    op: task.op,
    taskId: task.id,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  });
  await enrichTaskEventWithSave(ev);
  const t0 = Date.now();
  const attemptBase = {
    saveId: task.saveId,
    source: task.source,
    op: task.op,
    taskId: task.id,
    generationId: task.generationId,
    attempt: task.attempts + 1,
    leaseOwner: task.leaseOwner,
    leaseToken: task.leaseToken,
    cancellationFence: task.cancellationFence,
  };
  void track(
    commitEvent({
      kind: "pipeline.task.attempt",
      ts: t0,
      ...attemptBase,
      phase: "claimed",
      nextRunAt: null,
      deferredReason: null,
      durationMs: null,
      error: null,
    }),
  );
  const activity = downloadActivity.begin(task);
  const stopActivity = () => activity.finish("failed");
  controller.signal.addEventListener("abort", stopActivity, { once: true });
  const heartbeat = setInterval(
    () => {
      void heartbeatTaskLease(task).then((renewed) => {
        if (!renewed) controller.abort();
      });
    },
    Math.max(1_000, Math.floor(TASK_LEASE_MS / 3)),
  );
  try {
    if (!(await ingestLeaseStillRunnable(task))) {
      controller.abort();
      ev.outcome = "skipped";
      return;
    }
    const payload = TaskPayloadSchema.parse(task.payload);
    const budget = TASK_WATCHDOG_MS[task.op];
    let watchdogHandle: NodeJS.Timeout | null = null;
    const watchdog = new Promise<never>((_, reject) => {
      watchdogHandle = setTimeout(() => {
        metrics.watchdogTrips++;
        try {
          controller.abort();
        } catch {}
        reject(new WorkerWatchdogError(task.op, budget));
      }, budget);
    });
    try {
      await Promise.race([
        track(
          WORKERS[task.op](task.saveId, payload, {
            signal: controller.signal,
            reportActivity: activity.report,
            leaseToken: task.leaseToken,
            cancellationFence: task.cancellationFence,
          }),
        ),
        watchdog,
      ]);
    } finally {
      if (watchdogHandle) clearTimeout(watchdogHandle);
    }
    controller.signal.throwIfAborted();
    const settled = await markDone(task);
    if (!settled) {
      ev.outcome = "skipped";
      return;
    }
    metrics.tasksCompleted++;
    if (isSourceTask(task.op)) noteSuccess(task.source);
    await maybeFinalizeSave(task.saveId);
    await completeQueueGenerationIfSettled(task.generationId);
    activity.finish("completed");
    ev.outcome = "ok";
    ev.attempts = task.attempts + 1;
  } catch (err) {
    activity.finish("failed");
    const result = await handleFailure(task, err);
    if (result.settled) {
      await completeQueueGenerationIfSettled(task.generationId);
    }
    ev.outcome = result.settled ? result.outcome : "skipped";
    ev.error = toErrorInfo(err);
    ev.nextRunAt = result.nextRunAt;
    ev.attempts = result.recordedAttempts;
  } finally {
    clearInterval(heartbeat);
    controller.signal.removeEventListener("abort", stopActivity);
    runningTaskIds.delete(task.id);
    untrackRunningIngest(task.id);
    inflightByOp[task.op]--;
    inflightGlobal--;
    if (interactive) inflightInteractive--;
    ev.durationMs = Date.now() - t0;
    ev.pipeline = { inflight: inflightGlobal, paused };
    ev.gate = gateForSource(task.source);
    const phase: PipelineTaskAttemptEvent["phase"] =
      ev.outcome === "ok"
        ? "completed"
        : ev.outcome === "deferred"
          ? "deferred"
          : ev.outcome === "blocked"
            ? "blocked"
            : ev.outcome === "dead"
              ? "dead"
              : ev.outcome === "cancelled"
                ? "cancelled"
                : "stale_rejected";
    void track(
      commitEvent({
        kind: "pipeline.task.attempt",
        ts: Date.now(),
        ...attemptBase,
        phase,
        nextRunAt: ev.nextRunAt,
        deferredReason: task.deferredReason,
        durationMs: ev.durationMs,
        error: ev.error,
      }),
    );
    void track(commitEvent(ev));
    kickReconciler();
  }
}

async function releaseIngestForTrashedSaves(
  saveIds: readonly string[] | null,
): Promise<void> {
  const db = await getDb();
  const released = releaseTrashedIngestSync(db.$raw, saveIds, Date.now());
  for (const generationId of released.generationIds) {
    await completeQueueGenerationIfSettled(generationId);
  }
  if (released.cancelled > 0) {
    log.info("[pond pipeline:reconciler] stopped trashed ingest", {
      cancelled: released.cancelled,
    });
  }
}

async function resumeIngestForRestoredSaves(
  saveIds: readonly string[],
): Promise<void> {
  if (saveIds.length === 0) return;
  const db = await getDb();
  const resumed = resumeTrashedIngestSync(db.$raw, saveIds, Date.now());
  if (resumed > 0) {
    log.info("[pond pipeline:reconciler] resumed trashed ingest", { resumed });
    kickReconciler();
  }
}

registerTrashIngestHandler(async ({ trashedIds, restoredIds }) => {
  if (trashedIds.length > 0) await releaseIngestForTrashedSaves(trashedIds);
  if (restoredIds.length > 0) await resumeIngestForRestoredSaves(restoredIds);
});
