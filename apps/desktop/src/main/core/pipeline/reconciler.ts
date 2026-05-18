import { type Op, saves, type Task, tasks } from "@pond/schema/db";
import type { PipelineTaskEvent } from "@pond/schema/events";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import {
  commitEvent,
  commitSaveIngestEvent,
  startTaskEvent,
  toErrorInfo,
} from "../../lib/wide-event";
import { RateLimitedError, TransientError } from "./extractors/errors";
import { classifyError } from "./retry-policy";
import {
  noteSuccess,
  noteTransientFailure,
  setSourceCooldown,
  snapshotSourceGate,
  sourcePausedUntil,
} from "./source-gate";
import { runCaptureTweet } from "./workers/capture-tweet";
import { runEnsurePoster } from "./workers/ensure-poster";
import { runFetchAvatar } from "./workers/fetch-avatar";
import { runFetchBlobs } from "./workers/fetch-blobs";
import { runFetchVideoYtdlp } from "./workers/fetch-video-ytdlp";
import { FinalizeIncompleteError, runFinalize } from "./workers/finalize";
import { runHarvestMetadata } from "./workers/harvest-metadata";

const POLL_INTERVAL_MS = 5_000;
// Tuned against the scrape-window budgets (see `GLOBAL_POOL_CAP` and
// `PER_SOURCE_CAP` in scrape-window.ts). The two pool-bound ops
// (harvest_metadata, capture_tweet) share the per-source cap for
// whichever source dominates — currently Twitter at 3 — so per-op
// caps below act as a second-order limit; the per-source pool budget
// is the binding constraint.
const MAX_GLOBAL_INFLIGHT = 8;
const PER_OP_CONCURRENCY: Record<Op, number> = {
  harvest_metadata: 3,
  capture_tweet: 3,
  fetch_blobs: 4,
  fetch_video_ytdlp: 2,
  ensure_poster: 3,
  fetch_avatar: 4,
  finalize: 3,
};

// Wall-clock budget for a single worker invocation. If a worker exceeds
// this, the dispatcher treats it as a transient failure, releases the
// inflight counter, and lets the reconciler move on. The worker
// promise keeps running in the background (we can't cancel arbitrary
// Promises), but the reconciler is no longer pinned — without this
// safety net a single hung worker would silently freeze the entire
// queue (see: stalled `wc.loadURL` against X under soft-block).
const TASK_WATCHDOG_MS: Record<Op, number> = {
  harvest_metadata: 90_000,
  capture_tweet: 120_000,
  fetch_blobs: 5 * 60_000,
  fetch_video_ytdlp: 10 * 60_000,
  ensure_poster: 60_000,
  fetch_avatar: 60_000,
  finalize: 30_000,
};

// Time after which a `running` task whose dispatcher promise vanished
// (process crash, force-quit, OS sleep mid-await) is treated as
// abandoned and reset to `pending`. Anything older than 2x its
// watchdog has either finished (and failed to update the row) or
// died with the process.
const STALE_RUNNING_GRACE_FACTOR = 2;
const MAX_WATCHDOG_MS = Object.values(TASK_WATCHDOG_MS).reduce(
  (a, b) => Math.max(a, b),
  0,
);
const STALE_RUNNING_MS = MAX_WATCHDOG_MS * STALE_RUNNING_GRACE_FACTOR;

// Orphan sweep cadence after startup. The startup sweep covers tasks
// stranded by a previous run; the periodic sweep catches anything that
// flips into the same shape mid-runtime (e.g. a failed save's pending
// siblings if a future caller forgets to cascade).
const ORPHAN_SWEEP_INTERVAL_MS = 60_000;

class WorkerWatchdogError extends Error {
  constructor(op: Op, ms: number) {
    super(`worker watchdog: ${op} exceeded ${ms}ms`);
    this.name = "WorkerWatchdogError";
  }
}

interface WorkerContext {
  signal: AbortSignal;
}

type Worker = (
  saveId: string,
  payload: Record<string, unknown>,
  ctx: WorkerContext,
) => Promise<void>;

const WORKERS: Record<Op, Worker> = {
  harvest_metadata: (saveId, payload) =>
    runHarvestMetadata(saveId, payload as { force?: boolean }),
  capture_tweet: (saveId) => runCaptureTweet(saveId),
  fetch_blobs: (saveId) => runFetchBlobs(saveId),
  fetch_video_ytdlp: (saveId) => runFetchVideoYtdlp(saveId),
  ensure_poster: (saveId) => runEnsurePoster(saveId),
  fetch_avatar: (saveId) => runFetchAvatar(saveId),
  finalize: (saveId) => runFinalize(saveId),
};

let started = false;
let paused = false;
let pollTimer: NodeJS.Timeout | null = null;
let kickPending = false;
let nextOrphanSweepAt = 0;
const inflightByOp: Record<Op, number> = {
  harvest_metadata: 0,
  capture_tweet: 0,
  fetch_blobs: 0,
  fetch_video_ytdlp: 0,
  ensure_poster: 0,
  fetch_avatar: 0,
  finalize: 0,
};
let inflightGlobal = 0;
const runningTaskIds = new Set<string>();
const runningTasks = new Map<string, AbortController>();

const metrics = {
  tasksDispatched: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  tasksBlocked: 0,
  watchdogTrips: 0,
  cascadeEvents: 0,
};

export interface PipelineMetricsSnapshot {
  started: boolean;
  paused: boolean;
  inflightGlobal: number;
  inflightByOp: Record<Op, number>;
  runningTaskIds: string[];
  pausedSources: ReturnType<typeof snapshotSourceGate>;
  counters: typeof metrics;
}

export function getPipelineMetrics(): PipelineMetricsSnapshot {
  return {
    started,
    paused,
    inflightGlobal,
    inflightByOp: { ...inflightByOp },
    runningTaskIds: [...runningTaskIds],
    pausedSources: snapshotSourceGate(),
    counters: { ...metrics },
  };
}

export function isPipelinePaused(): boolean {
  return paused;
}

export function pausePipeline(): void {
  if (paused) return;
  paused = true;
  log.info("[pond pipeline:reconciler] paused");
}

export function resumePipeline(): void {
  if (!paused) return;
  paused = false;
  log.info("[pond pipeline:reconciler] resumed");
  kickReconciler();
}

export function startReconciler(): void {
  if (started) return;
  started = true;
  log.info("[pond pipeline:reconciler] starting");
  void recoverStaleRunningTasks().catch((err) =>
    log.warn("[pond pipeline:reconciler] stale-running sweep failed", err),
  );
  void sweepOrphanTasks().catch((err) =>
    log.warn("[pond pipeline:reconciler] orphan sweep failed", err),
  );
  nextOrphanSweepAt = Date.now() + ORPHAN_SWEEP_INTERVAL_MS;
  schedulePoll(POLL_INTERVAL_MS);
  void tick();
}

export function stopReconciler(): void {
  started = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  // Abort anything in flight so workers that honour the signal can
  // bail rather than racing the process exit.
  for (const controller of runningTasks.values()) {
    try {
      controller.abort();
    } catch {
      /* aborts can throw if the controller is already torn down */
    }
  }
  runningTasks.clear();
}

export function kickReconciler(): void {
  if (!started) return;
  if (kickPending) return;
  kickPending = true;
  setImmediate(() => {
    kickPending = false;
    void tick();
  });
}

// User-driven "skip the stuck op". Marks the named task `failed` and
// fans the failure out via the same cascade `handleFailure` uses, so
// the save flips to `failed` and the dialog updates. Used from the
// renderer when a user wants to abandon a save that's wedged on, say,
// a 600 MB video download.
export async function skipTask(
  taskId: string,
  reason: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get() as
    | Task
    | undefined;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "done") return { ok: false, reason: "already_done" };

  const now = new Date();
  db.update(tasks)
    .set({
      status: "failed",
      lastError: `skipped: ${reason}`,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  // Cascade — mirror the failed-task path in `handleFailure` so the
  // save row and downstream siblings move together.
  const current = db
    .select({ status: saves.status })
    .from(saves)
    .where(eq(saves.id, row.saveId))
    .get();
  if (current?.status === "ingesting") {
    db.update(saves)
      .set({ status: "failed" })
      .where(eq(saves.id, row.saveId))
      .run();
    db.update(tasks)
      .set({
        status: "failed",
        lastError: `blocked by skipped ${row.op}`,
        updatedAt: now,
      })
      .where(and(eq(tasks.saveId, row.saveId), eq(tasks.status, "pending")))
      .run();
  }

  // If a worker is actively running this task, abort it. The signal
  // doesn't preempt arbitrary Promises but workers that opt in
  // (child_process spawns, fetch with signal) will bail.
  const controller = runningTasks.get(taskId);
  if (controller) {
    try {
      controller.abort();
    } catch {
      /* worker may have just completed; ignore */
    }
  }

  log.info("[pond pipeline:reconciler] task skipped", {
    task: taskId,
    op: row.op,
    saveId: row.saveId,
    reason,
  });
  return { ok: true };
}

// Startup cleanup #1: any `running` task whose dispatcher promise no
// longer exists in memory either died with the previous process or
// updated the row but failed to flip status. Reset to `pending` so the
// reconciler picks it up again on the next tick. We give it 2x the
// largest watchdog as breathing room in case the app launched while
// the previous run was still draining (unlikely with single-instance
// lock, but cheap to be defensive).
async function recoverStaleRunningTasks(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const stale = db
    .select({ id: tasks.id, op: tasks.op, saveId: tasks.saveId })
    .from(tasks)
    .where(and(eq(tasks.status, "running"), lte(tasks.updatedAt, cutoff)))
    .all();
  if (stale.length === 0) return;
  const now = new Date();
  db.update(tasks)
    .set({
      status: "pending",
      lastError: "recovered: process restarted while running",
      updatedAt: now,
    })
    .where(
      inArray(
        tasks.id,
        stale.map((s) => s.id),
      ),
    )
    .run();
  log.info("[pond pipeline:reconciler] recovered stale running tasks", {
    count: stale.length,
  });
}

// Startup cleanup #2 (also run periodically): any `pending` task whose
// save is no longer `ingesting` (failed, blocked, deleted, complete)
// can never run — it's gated behind an op that's already failed or
// moot. Left in place these rows occupy the oldest slots of the
// `next_run_at ASC LIMIT 20` window and starve healthy ingesting
// saves. Mark them failed so the runtime view of the queue matches
// the user-facing state.
async function sweepOrphanTasks(): Promise<void> {
  const db = await getDb();
  const orphans = db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(saves, eq(tasks.saveId, saves.id))
    .where(and(eq(tasks.status, "pending"), ne(saves.status, "ingesting")))
    .all();
  if (orphans.length === 0) return;
  db.update(tasks)
    .set({
      status: "failed",
      lastError: "orphan: save no longer ingesting",
      updatedAt: new Date(),
    })
    .where(
      inArray(
        tasks.id,
        orphans.map((o) => o.id),
      ),
    )
    .run();
  log.info("[pond pipeline:reconciler] swept orphan tasks", {
    count: orphans.length,
  });
}

function schedulePoll(ms: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (!started) return;
    void tick().finally(() => schedulePoll(POLL_INTERVAL_MS));
  }, ms);
}

async function tick(): Promise<void> {
  if (!started) return;
  if (paused) return;
  if (Date.now() >= nextOrphanSweepAt) {
    nextOrphanSweepAt = Date.now() + ORPHAN_SWEEP_INTERVAL_MS;
    void sweepOrphanTasks().catch((err) =>
      log.warn("[pond pipeline:reconciler] periodic orphan sweep failed", err),
    );
  }
  if (inflightGlobal >= MAX_GLOBAL_INFLIGHT) return;
  const due = await pullDueTasks();
  if (due.length === 0) return;
  for (const task of due) {
    if (inflightGlobal >= MAX_GLOBAL_INFLIGHT) break;
    if (runningTaskIds.has(task.id)) continue;
    if (inflightByOp[task.op] >= PER_OP_CONCURRENCY[task.op]) continue;
    void dispatchTask(task);
  }
}

interface DueTask extends Task {
  source: string;
}

// Scope the queue to runnable tasks: ingesting save AND every earlier-idx
// op for the same save is already `done`. The NOT EXISTS subquery moves the
// sequential gate into SQL so the `next_run_at ASC LIMIT 20` window can't
// fill with tasks that `isOpReady` will reject. Earlier this was JS-only,
// which let an unattempted later op (its `next_run_at` still pinned at the
// original enqueue time) crowd out its own deferred leading op (pushed
// forward by a watchdog/backoff) at the head of the queue — the reconciler
// would then pull 20 blocked rows, dispatch none, and starve every other
// ingesting save behind them. The save-status filter further keeps tasks
// belonging to failed/blocked/deleted saves out of the window.
//
// We pull 3x the dispatch window so the per-save round-robin interleave
// below has enough material to truly spread across saves — otherwise a
// single save with 7 pending ops would dominate every window pull.
async function pullDueTasks(): Promise<DueTask[]> {
  const db = await getDb();
  const now = new Date();
  const rows = (await db
    .select({
      id: tasks.id,
      saveId: tasks.saveId,
      op: tasks.op,
      status: tasks.status,
      attempts: tasks.attempts,
      maxAttempts: tasks.maxAttempts,
      nextRunAt: tasks.nextRunAt,
      lastError: tasks.lastError,
      payload: tasks.payload,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      source: saves.source,
    })
    .from(tasks)
    .innerJoin(saves, eq(tasks.saveId, saves.id))
    .where(
      and(
        eq(tasks.status, "pending"),
        lte(tasks.nextRunAt, now),
        eq(saves.status, "ingesting"),
        sql`NOT EXISTS (
          SELECT 1 FROM ${tasks} AS peers
          WHERE peers.save_id = ${tasks.saveId}
            AND peers.status != 'done'
            AND ${opOrderCaseRaw("peers.op")} < ${opOrderCase(tasks.op)}
        )`,
      ),
    )
    .orderBy(asc(tasks.nextRunAt))
    .limit(60)) as unknown as DueTask[];

  if (rows.length === 0) return rows;

  // Per-save round-robin: bucket the candidates by saveId, then drain
  // one task per save per pass. The first 20 emitted will hit at most
  // 20 distinct saves before any save gets a second task — visible
  // progress is shared across the queue instead of monopolised by
  // whichever save happens to be at the head of the time-ordered
  // window. Also skip tasks whose source is currently paused
  // (cooldown / circuit-breaker) so we don't pin inflight slots on
  // work that the scrape-window lease would just stall on anyway.
  const buckets = new Map<string, DueTask[]>();
  for (const row of rows) {
    if (isSourceTask(row.op) && sourcePausedUntil(row.source as never) > 0) {
      continue;
    }
    const bucket = buckets.get(row.saveId);
    if (bucket) bucket.push(row);
    else buckets.set(row.saveId, [row]);
  }
  const interleaved: DueTask[] = [];
  let progress = true;
  while (progress && interleaved.length < 20) {
    progress = false;
    for (const bucket of buckets.values()) {
      if (interleaved.length >= 20) break;
      const next = bucket.shift();
      if (!next) continue;
      interleaved.push(next);
      progress = true;
    }
  }
  return interleaved;
}

// Ops that lease a hidden scrape window. Used to gate dispatch on the
// per-source pause state so we don't fill inflight slots with tasks
// that the scrape pool would just queue behind a cooldown.
function isSourceTask(op: Op): boolean {
  return op === "harvest_metadata" || op === "capture_tweet";
}

// CASE expression mapping each op to its position in the universal spec.
// Kept in sync with the order in `@pond/schema/db`'s `OPS`. The two
// variants are needed because the inner query uses a `peers` alias
// (raw column name) while the outer uses Drizzle's column reference.
function opOrderCase(opCol: typeof tasks.op) {
  return sql`(CASE ${opCol}
    WHEN 'harvest_metadata' THEN 0
    WHEN 'capture_tweet' THEN 1
    WHEN 'fetch_blobs' THEN 2
    WHEN 'fetch_video_ytdlp' THEN 3
    WHEN 'ensure_poster' THEN 4
    WHEN 'fetch_avatar' THEN 5
    WHEN 'finalize' THEN 6
  END)`;
}

function opOrderCaseRaw(rawCol: string) {
  return sql.raw(`(CASE ${rawCol}
    WHEN 'harvest_metadata' THEN 0
    WHEN 'capture_tweet' THEN 1
    WHEN 'fetch_blobs' THEN 2
    WHEN 'fetch_video_ytdlp' THEN 3
    WHEN 'ensure_poster' THEN 4
    WHEN 'fetch_avatar' THEN 5
    WHEN 'finalize' THEN 6
  END)`);
}

async function dispatchTask(task: DueTask): Promise<void> {
  runningTaskIds.add(task.id);
  inflightByOp[task.op]++;
  inflightGlobal++;
  metrics.tasksDispatched++;
  const controller = new AbortController();
  runningTasks.set(task.id, controller);
  /* One wide event per task attempt — populated as the work proceeds,
   * committed in the finally. Replaces the scattered "[pond pipeline:
   * reconciler] dispatching/done/failed" trio that used to require
   * three greps to reconstruct one outcome. */
  const ev: PipelineTaskEvent = startTaskEvent({
    saveId: task.saveId,
    source: task.source as PipelineTaskEvent["source"],
    op: task.op,
    taskId: task.id,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  });
  await enrichTaskEventWithSave(ev);
  const t0 = Date.now();
  try {
    await markRunning(task);
    const payload =
      task.payload && typeof task.payload === "object"
        ? (task.payload as Record<string, unknown>)
        : {};
    const budget = TASK_WATCHDOG_MS[task.op];
    let watchdogHandle: NodeJS.Timeout | null = null;
    const watchdog = new Promise<never>((_, reject) => {
      watchdogHandle = setTimeout(() => {
        metrics.watchdogTrips++;
        try {
          controller.abort();
        } catch {
          /* worker may already have settled */
        }
        reject(new WorkerWatchdogError(task.op, budget));
      }, budget);
    });
    try {
      await Promise.race([
        WORKERS[task.op](task.saveId, payload, { signal: controller.signal }),
        watchdog,
      ]);
    } finally {
      if (watchdogHandle) clearTimeout(watchdogHandle);
    }
    await markDone(task);
    metrics.tasksCompleted++;
    if (isSourceTask(task.op)) noteSuccess(task.source as never);
    await maybeFinalizeSave(task.saveId);
    ev.outcome = "ok";
    ev.attempts = task.attempts + 1;
  } catch (err) {
    const result = await handleFailure(task, err);
    ev.outcome = result.outcome;
    ev.error = toErrorInfo(err);
    ev.nextRunAt = result.nextRunAt;
    ev.attempts = result.recordedAttempts;
  } finally {
    runningTaskIds.delete(task.id);
    runningTasks.delete(task.id);
    inflightByOp[task.op]--;
    inflightGlobal--;
    ev.durationMs = Date.now() - t0;
    ev.pipeline = { inflight: inflightGlobal, paused };
    ev.gate = gateForSource(task.source);
    void commitEvent(ev);
    kickReconciler();
  }
}

async function enrichTaskEventWithSave(ev: PipelineTaskEvent): Promise<void> {
  try {
    const db = await getDb();
    const row = db
      .select({
        sourceId: saves.sourceId,
        url: saves.url,
      })
      .from(saves)
      .where(eq(saves.id, ev.saveId))
      .get();
    if (row) {
      ev.sourceId = row.sourceId ?? null;
      ev.url = row.url ?? null;
    }
  } catch {
    /* enrichment is best-effort; the rest of the event still goes
     * through unaffected if the lookup explodes. */
  }
}

function gateForSource(source: string): PipelineTaskEvent["gate"] {
  const snap = snapshotSourceGate();
  const hit = snap.find((e) => e.source === source);
  return hit ? { reason: hit.reason, until: hit.until } : null;
}

async function markRunning(task: Task): Promise<void> {
  const db = await getDb();
  db.update(tasks)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(tasks.id, task.id))
    .run();
}

async function markDone(task: Task): Promise<void> {
  const db = await getDb();
  db.update(tasks)
    .set({
      status: "done",
      attempts: task.attempts + 1,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .run();
}

interface FailureResult {
  outcome: "deferred" | "blocked" | "failed";
  nextRunAt: number | null;
  recordedAttempts: number;
}

async function handleFailure(
  task: DueTask,
  err: unknown,
): Promise<FailureResult> {
  if (err instanceof FinalizeIncompleteError) {
    // finalize already reset harvest_metadata for us; mark finalize as
    // pending again so it re-runs after the next harvest cycle.
    const db = await getDb();
    const nextRun = new Date(Date.now() + 30_000);
    db.update(tasks)
      .set({
        status: "pending",
        nextRunAt: nextRun,
        lastError: err.message,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .run();
    return {
      outcome: "deferred",
      nextRunAt: nextRun.getTime(),
      recordedAttempts: task.attempts,
    };
  }

  // Signal the source gate. Explicit rate-limit errors set a hard
  // cooldown — every queued task on that source defers, not just the
  // failed one. Only `TransientError` and watchdog trips advance the
  // breaker counter; everything else is per-URL or per-auth and isn't
  // a host-health signal. (Earlier this also counted `TerminalError`,
  // which made the breaker trip whenever a user retried a backlog of
  // dead-URL Twitter saves — the host was fine, the URLs weren't.)
  if (isSourceTask(task.op)) {
    const source = task.source as never;
    if (err instanceof RateLimitedError) {
      const ms = (err.retryAfterSec ?? 60) * 1000;
      setSourceCooldown(source, ms);
    } else if (
      err instanceof TransientError ||
      err instanceof WorkerWatchdogError
    ) {
      noteTransientFailure(source);
    }
  }

  const decision = classifyError(err, {
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  });
  if (decision.status === "blocked") metrics.tasksBlocked++;
  const db = await getDb();
  db.update(tasks)
    .set({
      status: decision.status,
      attempts: decision.recordAttempt ? task.attempts + 1 : task.attempts,
      nextRunAt: decision.nextRunAt,
      lastError: decision.lastError,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .run();

  const recordedAttempts = decision.recordAttempt
    ? task.attempts + 1
    : task.attempts;
  if (decision.status === "failed") {
    metrics.tasksFailed++;
    // Status only moves forward — once a save is `complete` (data on disk,
    // raw_json captured) a re-harvest failure shouldn't blow away the
    // user-visible state. The failed task row stays around so we can retry
    // later; the save itself keeps its previous status.
    const current = db
      .select({ status: saves.status })
      .from(saves)
      .where(eq(saves.id, task.saveId))
      .get();
    if (current?.status === "ingesting") {
      db.update(saves)
        .set({ status: "failed" })
        .where(eq(saves.id, task.saveId))
        .run();
      // Cascade: this task's failure blocks every later op in the
      // sequential spec via the per-save NOT EXISTS gate in
      // `pullDueTasks`. Mark still-pending siblings as failed too so
      // they don't linger as the oldest rows in the `next_run_at ASC`
      // window and starve healthy saves.
      db.update(tasks)
        .set({
          status: "failed",
          lastError: `blocked by failed ${task.op}`,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.saveId, task.saveId), eq(tasks.status, "pending")))
        .run();
      metrics.cascadeEvents += 1;
    }
    /* The save's terminal-failure event is owned by `maybeFinalizeSave`/
     * `finalize`; from here we just emit the per-task event in the
     * dispatcher's finally. */
    if (current?.status === "ingesting") {
      // Save just transitioned to failed because of this task — emit
      // the save-level ingest event right here. `maybeFinalizeSave`
      // only handles the success path.
      void commitSaveIngestEvent(task.saveId, {
        outcome: "failed",
        failedOp: task.op,
        error: toErrorInfo(err),
      });
    }
  }
  return {
    outcome:
      decision.status === "failed"
        ? "failed"
        : decision.status === "blocked"
          ? "blocked"
          : "deferred",
    nextRunAt: decision.nextRunAt.getTime(),
    recordedAttempts,
  };
}

// Event-driven replacement for the old whole-table `sweepCompleteSaves`
// pass. Called from `dispatchTask` after a successful run — flips the
// save to `complete` iff every one of its tasks is now `done`. The
// failed-task path already downgrades the save in `handleFailure`, so
// the only thing left for this helper to do is the success transition.
async function maybeFinalizeSave(saveId: string): Promise<void> {
  const db = await getDb();
  const save = db
    .select({ status: saves.status })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get();
  if (!save || save.status !== "ingesting") return;
  const rows = db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.saveId, saveId))
    .all();
  if (rows.length === 0) return;
  const allDone = rows.every((t) => t.status === "done");
  if (!allDone) return;
  db.update(saves)
    .set({ status: "complete", ingestCompletedAt: new Date() })
    .where(eq(saves.id, saveId))
    .run();
}
