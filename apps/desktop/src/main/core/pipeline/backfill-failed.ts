import { saves } from "@pond/schema/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { resetTasksForSave } from "./enqueue";
import { kickReconciler } from "./reconciler";

/* Per-source paced backfill for `status === "failed"` saves.
 *
 * The thing that pushed these saves into `failed` is usually a
 * soft-block from the source (X.com rate limiter, Pinterest pinned-IP
 * filter). Hitting the same partition in parallel just trips the same
 * limiter all over again — but partitions are per-host, so twitter
 * doesn't share a budget with pinterest. We group by `saves.source`
 * and run one serial chain per source; the chains run concurrently.
 *
 * Within a chain: reset save, kick reconciler, wait for the save to
 * settle (complete OR failed again), sleep, move on. Across chains:
 * a slow source can't block recovery on the others.
 *
 * Triggered from the renderer's ProcessingDialog "Retry all" button.
 * Single-save retries flow through `retryFailedSave` and skip the
 * pacing entirely. */

const SPACING_MS = 2_500;
const SETTLE_TIMEOUT_MS = 4 * 60_000;
const SETTLE_POLL_MS = 500;

export interface ProcessingBackfillStatus {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  recovered: number;
  stillFailed: number;
  startedAt: string | null;
  finishedAt: string | null;
  currentSaveId: string | null;
  message?: string;
}

type StatusListener = (status: ProcessingBackfillStatus) => void;
const listeners = new Set<StatusListener>();

let inFlight: AbortController | null = null;
let lastStatus: ProcessingBackfillStatus = idleStatus();

function idleStatus(): ProcessingBackfillStatus {
  return {
    state: "idle",
    total: 0,
    current: 0,
    recovered: 0,
    stillFailed: 0,
    startedAt: null,
    finishedAt: null,
    currentSaveId: null,
  };
}

function emit(next: ProcessingBackfillStatus): void {
  lastStatus = next;
  for (const cb of listeners) {
    try {
      cb(next);
    } catch (err) {
      log.warn("[pond pipeline:backfill-failed] listener threw", err);
    }
  }
}

export function subscribeProcessingBackfillStatus(
  cb: StatusListener,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProcessingBackfillStatus(): ProcessingBackfillStatus {
  return lastStatus;
}

export function isProcessingBackfilling(): boolean {
  return inFlight !== null;
}

export function cancelProcessingBackfill(): void {
  if (!inFlight) return;
  inFlight.abort();
}

export type ProcessingBackfillStartResult =
  | { ok: true; total: number }
  | { ok: false; reason: "already_running" | "no_saves" };

export async function startProcessingBackfill(): Promise<ProcessingBackfillStartResult> {
  if (inFlight) {
    return { ok: false as const, reason: "already_running" as const };
  }
  const groups = await pickFailedSavesGrouped();
  const total = sumGroupSizes(groups);
  if (total === 0) {
    emit({
      ...idleStatus(),
      state: "done",
      finishedAt: new Date().toISOString(),
      message: "Nothing to retry.",
    });
    return { ok: false as const, reason: "no_saves" as const };
  }

  const controller = new AbortController();
  inFlight = controller;

  emit({
    state: "running",
    total,
    current: 0,
    recovered: 0,
    stillFailed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentSaveId: null,
    message: `Retrying ${total} failed save${total === 1 ? "" : "s"} across ${groups.size} source${groups.size === 1 ? "" : "s"}…`,
  });

  void runWorker(groups, controller.signal).finally(() => {
    inFlight = null;
  });

  return { ok: true as const, total };
}

/* Single-save retry — synchronous reset + kick, no pacing. Used when
 * the user clicks the per-row "Retry" button in the dialog. Returns
 * once the reset has been written so the renderer can flip its own
 * status optimistically. */
export async function retryFailedSave(
  saveId: string,
  trigger: string = "user:retry-failed",
): Promise<{ ok: boolean; reason?: "not_found" | "not_failed" }> {
  const db = await getDb();
  const row = db
    .select({ id: saves.id, status: saves.status })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "failed") return { ok: false, reason: "not_failed" };
  await resetTasksForSave(saveId, trigger);
  kickReconciler();
  return { ok: true };
}

async function runWorker(
  groups: Map<string, string[]>,
  signal: AbortSignal,
): Promise<void> {
  const total = sumGroupSizes(groups);
  /* Shared progress counters. JS is single-threaded so atomic increments
   * are safe; each `await` boundary in the chains is the only place we
   * yield. We re-emit after every settled save from any chain. */
  const counters = { current: 0, recovered: 0, stillFailed: 0 };

  const chains = Array.from(groups.entries()).map(([source, ids]) =>
    runSourceChain(source, ids, total, signal, counters),
  );
  await Promise.all(chains);

  const finishedAt = new Date().toISOString();
  emit({
    ...lastStatus,
    state: signal.aborted ? "cancelled" : "done",
    finishedAt,
    currentSaveId: null,
    message: messageForFinish(
      signal.aborted,
      counters.current,
      counters.recovered,
      counters.stillFailed,
    ),
  });
}

async function runSourceChain(
  source: string,
  ids: string[],
  total: number,
  signal: AbortSignal,
  counters: { current: number; recovered: number; stillFailed: number },
): Promise<void> {
  for (const id of ids) {
    if (signal.aborted) return;
    emit({
      ...lastStatus,
      state: "running",
      total,
      currentSaveId: id,
      message: messageForProgress(
        counters.current,
        total,
        counters.recovered,
        counters.stillFailed,
      ),
    });

    try {
      await resetTasksForSave(id, `user:retry-all-failed:${source}`);
      kickReconciler();
    } catch (err) {
      log.warn("[pond pipeline:backfill-failed] reset failed", id, err);
      counters.current += 1;
      counters.stillFailed += 1;
      continue;
    }

    const outcome = await waitForSettle(id, signal);
    counters.current += 1;
    if (outcome === "complete") counters.recovered += 1;
    else counters.stillFailed += 1;

    emit({
      ...lastStatus,
      state: "running",
      total,
      current: counters.current,
      recovered: counters.recovered,
      stillFailed: counters.stillFailed,
      currentSaveId: null,
      message: messageForProgress(
        counters.current,
        total,
        counters.recovered,
        counters.stillFailed,
      ),
    });

    if (signal.aborted) return;
    if (counters.current < total) {
      await sleep(SPACING_MS, signal);
    }
  }
}

/* Poll the save row until it leaves `ingesting`. We don't have a push
 * signal from the reconciler, but the pipeline writes to `saves.status`
 * synchronously when finalize runs (or when handleFailure downgrades),
 * so a half-second poll is plenty responsive without thrashing SQLite. */
async function waitForSettle(
  saveId: string,
  signal: AbortSignal,
): Promise<"complete" | "failed" | "timeout"> {
  const db = await getDb();
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const row = db
      .select({ status: saves.status })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get();
    if (!row) return "failed";
    if (row.status === "complete") return "complete";
    if (row.status === "failed") return "failed";
    await sleep(SETTLE_POLL_MS, signal);
  }
  return "timeout";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function pickFailedSavesGrouped(): Promise<Map<string, string[]>> {
  const db = await getDb();
  const rows = await db
    .select({ id: saves.id, source: saves.source })
    .from(saves)
    .where(and(eq(saves.status, "failed"), isNull(saves.deletedAt)))
    .orderBy(asc(saves.savedAt));
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const bucket = groups.get(row.source);
    if (bucket) bucket.push(row.id);
    else groups.set(row.source, [row.id]);
  }
  return groups;
}

function sumGroupSizes(groups: Map<string, string[]>): number {
  let n = 0;
  for (const ids of groups.values()) n += ids.length;
  return n;
}

function messageForProgress(
  current: number,
  total: number,
  recovered: number,
  stillFailed: number,
): string {
  const parts = [`${current}/${total}`, `${recovered} recovered`];
  if (stillFailed > 0) parts.push(`${stillFailed} still failed`);
  return parts.join(" · ");
}

function messageForFinish(
  cancelled: boolean,
  current: number,
  recovered: number,
  stillFailed: number,
): string {
  const head = cancelled
    ? `Cancelled at ${current}.`
    : `Retried ${current} save${current === 1 ? "" : "s"}.`;
  const tail: string[] = [];
  if (recovered > 0) tail.push(`${recovered} recovered`);
  if (stillFailed > 0) tail.push(`${stillFailed} still failed`);
  return tail.length > 0 ? `${head} ${tail.join(" · ")}` : head;
}
