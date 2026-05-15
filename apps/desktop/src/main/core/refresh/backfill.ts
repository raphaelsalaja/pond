import type { Source } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { type RefreshOutcome, refreshSave } from "./index";
import { POOL_SIZE } from "./scrape-window";

export interface RefreshBackfillOptions {
  source?: Source | null;
  onlyMissing?: boolean;
}

export interface RefreshBackfillStatus {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  succeeded: number;
  failed: number;
  authRequired: Source[];
  startedAt: string | null;
  finishedAt: string | null;
  options: RefreshBackfillOptions;
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

  void runWorker(ids, controller.signal, opts).finally(() => {
    inFlight = null;
  });

  return { ok: true as const, total: ids.length };
}

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

  for (let i = 0; i < ids.length; i += POOL_SIZE) {
    if (signal.aborted) break;
    const batch = ids.slice(i, i + POOL_SIZE);
    const outcomes = await Promise.all(
      batch.map(async (id): Promise<RefreshOutcome> => {
        try {
          return await refreshSave(id);
        } catch (err) {
          log.warn("[pond refresh-backfill] refreshSave threw", id, err);
          return { ok: false, reason: "internal_error" };
        }
      }),
    );

    for (const outcome of outcomes) {
      current += 1;
      if (outcome.ok) {
        succeeded += 1;
      } else if (outcome.reason === "auth_required" && outcome.source) {
        authRequired.add(outcome.source);
        failed += 1;
      } else {
        failed += 1;
      }
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
