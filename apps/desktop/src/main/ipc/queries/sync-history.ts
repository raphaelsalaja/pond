import type { Source } from "@pond/schema/db";
import { pipelineEvents } from "@pond/schema/events";
import type { PipelineEventRow, SyncRunEvent } from "@pond/schema/events";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import {
  NonEmptyTextParam,
  OptionalNumberParam,
  query,
  SourceParam,
} from "./params";
import type { QueryHandlerMap } from "./params";

interface SyncRunHistoryEntry {
  id: number;
  ts: number;
  source: Source;
  accountId: string | null;
  trigger: string;
  outcome: SyncRunEvent["outcome"];
  durationMs: number;
  harvest: SyncRunEvent["harvest"];
  enqueue: SyncRunEvent["enqueue"];
  error: SyncRunEvent["error"];
  watchdogTripped: boolean;
}

function toEntry(row: PipelineEventRow): SyncRunHistoryEntry | null {
  const payload = row.payload;
  if (payload.kind !== "sync.run.completed") {
    return null;
  }
  return {
    id: row.id,
    ts: row.ts.getTime(),
    source: payload.source,
    accountId: payload.accountId ?? null,
    trigger: payload.trigger ?? row.trigger ?? "manual",
    outcome: payload.outcome,
    durationMs: payload.durationMs ?? 0,
    harvest: payload.harvest ?? null,
    enqueue: payload.enqueue ?? null,
    error: payload.error ?? null,
    watchdogTripped: payload.watchdogTripped ?? false,
  };
}

function itemsOf(run: SyncRunHistoryEntry): number {
  return run.enqueue?.succeeded ?? run.harvest?.fresh ?? 0;
}

const OK_OUTCOMES = new Set<SyncRunEvent["outcome"]>(["ok", "noop"]);
const FAIL_OUTCOMES = new Set<SyncRunEvent["outcome"]>([
  "error",
  "auth_required",
  "rate_limited",
]);

interface SyncStats {
  itemsSynced: number;
  itemsSyncedPrev: number;
  newToday: number;
  runsToday: number;
  runs: number;
  successRate: number;
  successRatePrev: number;
  avgRunMs: number;
  avgRunMsPrev: number;
  failed: number;
  recovered: number;
  lastRunAt: number | null;
}

function toEntries(rows: Array<PipelineEventRow>): Array<SyncRunHistoryEntry> {
  return rows.flatMap((row) => {
    const entry = toEntry(row);
    return entry ? [entry] : [];
  });
}

function sumItems(runs: Array<SyncRunHistoryEntry>): number {
  return runs.reduce((acc, r) => acc + itemsOf(r), 0);
}

function successRate(runs: Array<SyncRunHistoryEntry>): number {
  if (runs.length === 0) {
    return 0;
  }
  const ok = runs.filter((r) => OK_OUTCOMES.has(r.outcome)).length;
  return Math.round((ok / runs.length) * 100);
}

function avgMs(runs: Array<SyncRunHistoryEntry>): number {
  if (runs.length === 0) {
    return 0;
  }
  return Math.round(
    runs.reduce((acc, r) => acc + (r.durationMs || 0), 0) / runs.length,
  );
}

function clampWindow(value: number, ceiling: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1), ceiling)
    : fallback;
}

const LimitParams = z.object({ limit: OptionalNumberParam });
const DaysParams = z.object({ days: OptionalNumberParam });

export const syncHistoryQueries = {
  "sync.history": query(
    z.object({
      source: SourceParam,
      accountId: NonEmptyTextParam,
      limit: OptionalNumberParam,
    }),
    async (params) => {
      const source = params.source;
      if (!source) {
        return { runs: [] };
      }
      const accountId = params.accountId;
      const limit = clampWindow(params.limit ?? 25, 200, 25);

      const db = await getDb();
      const rows = db
        .select()
        .from(pipelineEvents)
        .where(
          and(
            eq(pipelineEvents.kind, "sync.run.completed"),
            eq(pipelineEvents.source, source),
            ...(accountId ? [eq(pipelineEvents.accountId, accountId)] : []),
          ),
        )
        .orderBy(desc(pipelineEvents.ts))
        .limit(limit)
        .all();

      return { runs: toEntries(rows) };
    },
  ),

  "sync.recent": query(LimitParams, async (params) => {
    const limit = clampWindow(params.limit ?? 50, 500, 50);

    const db = await getDb();
    const rows = db
      .select()
      .from(pipelineEvents)
      .where(eq(pipelineEvents.kind, "sync.run.completed"))
      .orderBy(desc(pipelineEvents.ts))
      .limit(limit)
      .all();

    return { runs: toEntries(rows) };
  }),

  "sync.runs": query(DaysParams, async (params) => {
    const days = clampWindow(params.days ?? 7, 90, 7);
    const sinceMs = Date.now() - days * 86_400_000;

    const db = await getDb();
    const rows = db
      .select()
      .from(pipelineEvents)
      .where(
        and(
          eq(pipelineEvents.kind, "sync.run.completed"),
          gte(pipelineEvents.ts, new Date(sinceMs)),
        ),
      )
      .orderBy(desc(pipelineEvents.ts))
      .limit(2000)
      .all();

    return { runs: toEntries(rows) };
  }),

  "sync.stats": query(DaysParams, async (params) => {
    const days = clampWindow(params.days ?? 7, 90, 7);

    const db = await getDb();
    const rows = toEntries(
      db
        .select()
        .from(pipelineEvents)
        .where(eq(pipelineEvents.kind, "sync.run.completed"))
        .orderBy(desc(pipelineEvents.ts))
        .limit(2000)
        .all(),
    );

    const now = Date.now();
    const dayMs = 86_400_000;
    const windowMs = days * dayMs;
    const cur = now - windowMs;
    const prev = now - windowMs * 2;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const current = rows.filter((r) => r.ts >= cur);
    const previous = rows.filter((r) => r.ts >= prev && r.ts < cur);

    const stats: SyncStats = {
      itemsSynced: sumItems(current),
      itemsSyncedPrev: sumItems(previous),
      newToday: rows
        .filter((r) => r.ts >= todayMs)
        .reduce((acc, r) => acc + (r.harvest?.fresh ?? itemsOf(r)), 0),
      runsToday: rows.filter((r) => r.ts >= todayMs).length,
      runs: current.length,
      successRate: successRate(current),
      successRatePrev: successRate(previous),
      avgRunMs: avgMs(current),
      avgRunMsPrev: avgMs(previous),
      failed: current.filter((r) => FAIL_OUTCOMES.has(r.outcome)).length,
      recovered: current.filter((r) => r.watchdogTripped).length,
      lastRunAt: rows[0]?.ts ?? null,
    };

    return stats;
  }),
} satisfies QueryHandlerMap;
