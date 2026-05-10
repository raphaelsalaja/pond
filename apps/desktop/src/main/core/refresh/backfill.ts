import type { Source } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { type RefreshOutcome, refreshSave } from "./index";

/**
 * Bulk metadata refresh orchestrator.
 *
 * Walks the existing saves table and re-runs `refreshSave(id)` on every
 * row that matches the supplied filter. Mirrors the per-source sync
 * orchestrator in `core/sync` shape-wise: a single in-flight controller,
 * a status push channel, and an abort signal the worker checks between
 * iterations.
 *
 * Why this is its own module rather than a one-liner over
 * `db.select(...).map(refreshSave)`:
 *
 *   - The hidden Chromium window inside `refreshSave` is a singleton,
 *     so we have to run sequentially anyway. A naive `Promise.all` would
 *     just queue inside the hidden window and lose all visibility.
 *   - The renderer wants live progress (current/total + per-source
 *     auth-required hints) so the UI can show a progress bar and a
 *     "Sign in to <source>" callout without waiting for the run to
 *     finish.
 *   - Cancellation has to be cooperative — abort the loop, never the
 *     in-flight `refreshSave` call. The user clicking "Cancel" stops
 *     enqueuing more, but lets the current row finish so we don't
 *     leave the hidden window in a half-navigated state.
 */

export interface RefreshBackfillOptions {
  /**
   * Restrict the run to a single source. `null`/`undefined` means
   * "every source". The renderer's source picker hands either a
   * concrete source or `null` for the "All sources" option.
   */
  source?: Source | null;
  /**
   * When true, only consider rows that look incomplete:
   *   - missing `mediaUrl`, OR
   *   - missing `title`, OR
   *   - missing `description`.
   *
   * Useful right after upgrading a harvester or the OG reader — you
   * only want to retry the rows that previously came back empty,
   * without paying the cost of re-running over rows we already have
   * full metadata for.
   */
  onlyMissing?: boolean;
}

export interface RefreshBackfillStatus {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  /** Total rows the run plans to visit (frozen at run start). */
  total: number;
  /** Rows visited so far, success or failure. */
  current: number;
  /** Rows where refreshSave returned `ok: true`. */
  succeeded: number;
  /** Rows where refreshSave returned `ok: false` for any reason except auth. */
  failed: number;
  /**
   * Sources that bounced us with `auth_required` at least once during
   * the run. Surfaced in the UI so the user can click "Sign in to
   * <source>" without scrolling through the activity log.
   */
  authRequired: Source[];
  startedAt: string | null;
  finishedAt: string | null;
  /** Filter the active/last run was launched with. */
  options: RefreshBackfillOptions;
  /** Free-form line for the renderer's status banner. */
  message?: string;
}

type StatusListener = (status: RefreshBackfillStatus) => void;
const listeners = new Set<StatusListener>();

let inFlight: AbortController | null = null;
let lastStatus: RefreshBackfillStatus = idleStatus({});

function idleStatus(options: RefreshBackfillOptions): RefreshBackfillStatus {
  return {
    state: "idle",
    total: 0,
    current: 0,
    succeeded: 0,
    failed: 0,
    authRequired: [],
    startedAt: null,
    finishedAt: null,
    options,
  };
}

function emit(next: RefreshBackfillStatus): void {
  lastStatus = next;
  for (const cb of listeners) {
    try {
      cb(next);
    } catch (err) {
      log.warn("[pond refresh-backfill] listener threw", err);
    }
  }
}

export function subscribeRefreshBackfillStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getRefreshBackfillStatus(): RefreshBackfillStatus {
  return lastStatus;
}

export function isRefreshBackfilling(): boolean {
  return inFlight !== null;
}

export type RefreshBackfillStartResult =
  | { ok: true; total: number }
  | { ok: false; reason: "already_running" | "no_saves" };

/**
 * Kick off a backfill run. Idempotent — concurrent calls return
 * `already_running` instead of stacking.
 *
 * Returns synchronously after the worker is enqueued; progress is
 * surfaced via `subscribeRefreshBackfillStatus`. The renderer should
 * subscribe BEFORE calling start so the very first event isn't lost.
 */
export async function startRefreshBackfill(
  opts: RefreshBackfillOptions = {},
): Promise<RefreshBackfillStartResult> {
  if (inFlight) {
    return { ok: false as const, reason: "already_running" as const };
  }

  const ids = await pickIdsForBackfill(opts);
  if (ids.length === 0) {
    emit({
      ...idleStatus(opts),
      state: "done",
      finishedAt: new Date().toISOString(),
      message: "No saves matched the filter.",
    });
    return { ok: false as const, reason: "no_saves" as const };
  }

  const controller = new AbortController();
  inFlight = controller;

  const start: RefreshBackfillStatus = {
    state: "running",
    total: ids.length,
    current: 0,
    succeeded: 0,
    failed: 0,
    authRequired: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    options: opts,
    message: `Refreshing ${ids.length} save${ids.length === 1 ? "" : "s"}…`,
  };
  emit(start);

  // Fire-and-forget: the renderer doesn't await this. Any uncaught
  // throw from the worker is captured and surfaced via the status
  // channel so the UI never silently stalls.
  void runWorker(ids, controller.signal, opts).finally(() => {
    inFlight = null;
  });

  return { ok: true as const, total: ids.length };
}

/**
 * Cooperative cancel. Flips the abort signal; the worker stops
 * enqueuing new rows but lets the in-flight `refreshSave` finish so
 * we never leave the hidden window mid-navigation.
 */
export function cancelRefreshBackfill(): void {
  if (!inFlight) return;
  inFlight.abort();
}

async function runWorker(
  ids: string[],
  signal: AbortSignal,
  opts: RefreshBackfillOptions,
): Promise<void> {
  let succeeded = 0;
  let failed = 0;
  const authRequired = new Set<Source>();
  let current = 0;

  for (const id of ids) {
    if (signal.aborted) break;
    current += 1;
    let outcome: RefreshOutcome;
    try {
      outcome = await refreshSave(id);
    } catch (err) {
      log.warn("[pond refresh-backfill] refreshSave threw", id, err);
      outcome = { ok: false, reason: "internal_error" };
    }

    if (outcome.ok) {
      succeeded += 1;
    } else if (outcome.reason === "auth_required" && outcome.source) {
      authRequired.add(outcome.source);
      // Treat as a soft failure — the row is still counted in
      // `failed` so the user understands why the totals don't line up,
      // but the source-level auth toast tells them the actionable fix.
      failed += 1;
    } else {
      failed += 1;
    }

    emit({
      state: "running",
      total: ids.length,
      current,
      succeeded,
      failed,
      authRequired: [...authRequired],
      startedAt: lastStatus.startedAt,
      finishedAt: null,
      options: opts,
      message: messageForProgress(
        current,
        ids.length,
        succeeded,
        failed,
        authRequired,
      ),
    });
  }

  const finishedAt = new Date().toISOString();
  emit({
    state: signal.aborted ? "cancelled" : "done",
    total: ids.length,
    current,
    succeeded,
    failed,
    authRequired: [...authRequired],
    startedAt: lastStatus.startedAt,
    finishedAt,
    options: opts,
    message: messageForFinish(
      signal.aborted,
      current,
      succeeded,
      failed,
      authRequired,
    ),
  });
}

function messageForProgress(
  current: number,
  total: number,
  ok: number,
  fail: number,
  auth: Set<Source>,
): string {
  const parts = [`${current}/${total}`, `${ok} ok`];
  if (fail > 0) parts.push(`${fail} failed`);
  if (auth.size > 0) parts.push(`${auth.size} need sign-in`);
  return parts.join(" · ");
}

function messageForFinish(
  cancelled: boolean,
  current: number,
  ok: number,
  fail: number,
  auth: Set<Source>,
): string {
  const head = cancelled
    ? `Cancelled at ${current}.`
    : `Refreshed ${current} save${current === 1 ? "" : "s"}.`;
  const tail: string[] = [];
  if (ok > 0) tail.push(`${ok} updated`);
  if (fail > 0) tail.push(`${fail} failed`);
  if (auth.size > 0) {
    const list = [...auth].sort().join(", ");
    tail.push(`needs sign-in: ${list}`);
  }
  return tail.length > 0 ? `${head} ${tail.join(" · ")}` : head;
}

/**
 * Resolve the filter to a concrete, ordered list of save ids. We hand
 * back the ids only — `refreshSave` re-reads each row inside its own
 * transaction, so by the time the worker gets to row N anything the
 * user did to it in the meantime (edits, trash, re-tag) is honoured.
 *
 * Ordering is `savedAt ASC` so older saves get refreshed first. Rationale:
 *   - they're the rows most likely to have stale metadata,
 *   - the renderer's grid sorts newest-first so the freshly refreshed
 *     bytes don't yank the user's viewport around.
 */
async function pickIdsForBackfill(
  opts: RefreshBackfillOptions,
): Promise<string[]> {
  const db = await getDb();
  const conds = [isNull(saves.deletedAt)];
  if (opts.source) {
    conds.push(eq(saves.source, opts.source));
  }
  if (opts.onlyMissing) {
    const missing = or(
      isNull(saves.mediaUrl),
      isNull(saves.title),
      isNull(saves.description),
    );
    if (missing) conds.push(missing);
  }
  const rows = await db
    .select({ id: saves.id })
    .from(saves)
    .where(and(...conds))
    .orderBy(asc(saves.savedAt));
  return rows.map((r) => r.id);
}
