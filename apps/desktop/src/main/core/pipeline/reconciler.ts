import { type Op, saves, type Task, tasks } from "@pond/schema/db";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { classifyError } from "./retry-policy";
import { runCaptureTweet } from "./workers/capture-tweet";
import { runEnsurePoster } from "./workers/ensure-poster";
import { runFetchAvatar } from "./workers/fetch-avatar";
import { runFetchBlobs } from "./workers/fetch-blobs";
import { runFetchVideoYtdlp } from "./workers/fetch-video-ytdlp";
import { FinalizeIncompleteError, runFinalize } from "./workers/finalize";
import { runHarvestMetadata } from "./workers/harvest-metadata";

const POLL_INTERVAL_MS = 5_000;
// Tuned against the scrape-window pool size (see `POOL_SIZE` in
// scrape-window.ts). The two pool-bound ops (harvest_metadata,
// capture_tweet) together demand at most their cap sum of windows;
// keep that sum at or just below POOL_SIZE so the slowest queue path
// isn't starving on lease contention.
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

class WorkerWatchdogError extends Error {
  constructor(op: Op, ms: number) {
    super(`worker watchdog: ${op} exceeded ${ms}ms`);
    this.name = "WorkerWatchdogError";
  }
}

type Worker = (
  saveId: string,
  payload: Record<string, unknown>,
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
let pollTimer: NodeJS.Timeout | null = null;
let kickPending = false;
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

export function startReconciler(): void {
  if (started) return;
  started = true;
  log.info("[pond pipeline:reconciler] starting");
  void sweepOrphanTasks().catch((err) =>
    log.warn("[pond pipeline:reconciler] orphan sweep failed", err),
  );
  schedulePoll(POLL_INTERVAL_MS);
  void tick();
}

// One-shot startup cleanup: any `pending` task whose save is no longer
// `ingesting` (failed, blocked, deleted, complete) can never run — it's
// gated behind an op that's already failed or moot. Left in place these
// rows occupy the oldest slots of the `next_run_at ASC LIMIT 20` window
// and starve healthy ingesting saves. Mark them failed so the runtime
// view of the queue matches the user-facing state.
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

export function stopReconciler(): void {
  started = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
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

function schedulePoll(ms: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (!started) return;
    void tick().finally(() => schedulePoll(POLL_INTERVAL_MS));
  }, ms);
}

async function tick(): Promise<void> {
  if (!started) return;
  if (inflightGlobal >= MAX_GLOBAL_INFLIGHT) return;
  const due = await pullDueTasks();
  if (due.length === 0) {
    await sweepCompleteSaves();
    return;
  }
  for (const task of due) {
    if (inflightGlobal >= MAX_GLOBAL_INFLIGHT) break;
    if (runningTaskIds.has(task.id)) continue;
    if (inflightByOp[task.op] >= PER_OP_CONCURRENCY[task.op]) continue;
    void dispatchTask(task);
  }
  await sweepCompleteSaves();
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
async function pullDueTasks(): Promise<Task[]> {
  const db = await getDb();
  const now = new Date();
  return db
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
    .limit(20);
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

async function dispatchTask(task: Task): Promise<void> {
  runningTaskIds.add(task.id);
  inflightByOp[task.op]++;
  inflightGlobal++;
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
        log.warn("[pond pipeline:reconciler] worker watchdog tripped", {
          task: task.id,
          saveId: task.saveId,
          op: task.op,
          budgetMs: budget,
        });
        reject(new WorkerWatchdogError(task.op, budget));
      }, budget);
    });
    try {
      await Promise.race([WORKERS[task.op](task.saveId, payload), watchdog]);
    } finally {
      if (watchdogHandle) clearTimeout(watchdogHandle);
    }
    await markDone(task);
  } catch (err) {
    await handleFailure(task, err);
  } finally {
    runningTaskIds.delete(task.id);
    inflightByOp[task.op]--;
    inflightGlobal--;
    kickReconciler();
  }
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

async function handleFailure(task: Task, err: unknown): Promise<void> {
  if (err instanceof FinalizeIncompleteError) {
    // finalize already reset harvest_metadata for us; mark finalize as
    // pending again so it re-runs after the next harvest cycle.
    const db = await getDb();
    db.update(tasks)
      .set({
        status: "pending",
        nextRunAt: new Date(Date.now() + 30_000),
        lastError: err.message,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .run();
    log.warn("[pond pipeline:reconciler] finalize incomplete", {
      task: task.id,
      saveId: task.saveId,
      missing: err.missing,
    });
    return;
  }

  const decision = classifyError(err, {
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  });
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

  if (decision.status === "failed") {
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
    }
    log.warn("[pond pipeline:reconciler] task failed", {
      task: task.id,
      saveId: task.saveId,
      op: task.op,
      saveStatus: current?.status,
      downgraded: current?.status === "ingesting",
      lastError: decision.lastError,
    });
  } else {
    log.info("[pond pipeline:reconciler] task deferred", {
      task: task.id,
      op: task.op,
      status: decision.status,
      nextRunAt: decision.nextRunAt,
    });
  }
}

async function sweepCompleteSaves(): Promise<void> {
  const db = await getDb();
  // saves still in `ingesting` whose every task is `done` need their finalize
  // worker run (or are already complete). The finalize worker writes the
  // status; this is a safety net for races where finalize completed but the
  // save row wasn't updated for some reason.
  const ingesting = db
    .select()
    .from(saves)
    .where(eq(saves.status, "ingesting"))
    .all();
  for (const save of ingesting) {
    const rows = db.select().from(tasks).where(eq(tasks.saveId, save.id)).all();
    if (rows.length === 0) continue;
    const allDone = rows.every((t) => t.status === "done");
    const anyFailed = rows.some((t) => t.status === "failed");
    if (anyFailed) {
      db.update(saves)
        .set({ status: "failed" })
        .where(eq(saves.id, save.id))
        .run();
    } else if (allDone) {
      db.update(saves)
        .set({ status: "complete", ingestCompletedAt: new Date() })
        .where(eq(saves.id, save.id))
        .run();
    }
  }
}
