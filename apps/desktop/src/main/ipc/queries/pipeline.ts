import { type Op, tasks } from "@pond/schema/db";
import {
  EVENT_KINDS,
  type EventKind,
  type PipelineEventRow,
  pipelineEvents,
  type WideEvent,
} from "@pond/schema/events";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import {
  getPipelineMetrics,
  isPipelinePaused,
  kickReconciler,
  pausePipeline,
  resumePipeline,
  skipTask,
} from "../../core/pipeline/reconciler";
import { snapshotSourceGate } from "../../core/pipeline/source-gate";
import { getDb } from "../../db";
import type { QueryHandlerMap } from "../helpers";

export interface PipelineEventWire {
  id: number;
  ts: number;
  kind: EventKind;
  saveId: string | null;
  source: string | null;
  op: string | null;
  outcome: string;
  durationMs: number | null;
  attempts: number | null;
  errorName: string | null;
  errorMessage: string | null;
  trigger: string | null;
  payload: WideEvent;
}

interface FacetEntry {
  value: string;
  count: number;
}

function toWire(row: PipelineEventRow): PipelineEventWire {
  return {
    id: row.id,
    ts: row.ts.getTime(),
    kind: row.kind,
    saveId: row.saveId,
    source: row.source,
    op: row.op,
    outcome: row.outcome,
    durationMs: row.durationMs,
    attempts: row.attempts,
    errorName: row.errorName,
    errorMessage: row.errorMessage,
    trigger: row.trigger,
    payload: row.payload,
  };
}

export const pipelineQueries: QueryHandlerMap = {
  async "pipeline.metrics"() {
    return getPipelineMetrics();
  },

  async "pipeline.pause"() {
    pausePipeline();
    return { ok: true as const, paused: isPipelinePaused() };
  },

  async "pipeline.resume"() {
    resumePipeline();
    return { ok: true as const, paused: isPipelinePaused() };
  },

  async "pipeline.kick"() {
    kickReconciler();
    return { ok: true as const };
  },

  async "pipeline.sourceGate"() {
    return { entries: snapshotSourceGate() };
  },

  // Skip the currently-stuck task on a save. The dialog uses this to
  // give the user an escape hatch when a single op (typically
  // `fetch_video_ytdlp` against a giant file, or `harvest_metadata`
  // against a soft-blocked host) is blocking everything else on the
  // save. We accept either a `taskId` (when the renderer has it from
  // `saves.processingDetails`) or a `saveId` + `op` pair.
  async "tasks.skip"(params) {
    const taskId = params.taskId ? String(params.taskId) : null;
    const saveId = params.saveId ? String(params.saveId) : null;
    const op = params.op ? String(params.op) : null;
    const reason = params.reason ? String(params.reason) : "user:skip";

    let resolvedTaskId = taskId;
    if (!resolvedTaskId && saveId && op) {
      try {
        const db = await getDb();
        const row = db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.saveId, saveId), eq(tasks.op, op as Op)))
          .get();
        resolvedTaskId = row?.id ?? null;
      } catch (err) {
        log.warn("[pond ipc] tasks.skip lookup failed", err);
      }
    }

    if (!resolvedTaskId) {
      return { ok: false as const, reason: "not_found" as const };
    }
    return skipTask(resolvedTaskId, reason);
  },

  /* The Activity panel's recent-N view. Filters are intentionally
   * narrow — every column we expose to the UI is indexed in
   * `pipeline_events`, so adding a knob means adding it here AND in
   * the schema's index list, not silently regressing into a table
   * scan. */
  async "pipeline.events.list"(params) {
    const db = await getDb();
    const kind =
      params.kind && EVENT_KINDS.includes(params.kind as EventKind)
        ? (params.kind as EventKind)
        : null;
    const source = params.source ? String(params.source) : null;
    const op = params.op ? String(params.op) : null;
    const outcome = params.outcome ? String(params.outcome) : null;
    const errorName = params.errorName ? String(params.errorName) : null;
    const saveId = params.saveId ? String(params.saveId) : null;
    const sinceMs = Number(params.sinceMs);
    const since =
      Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs) : null;
    const limit = Math.min(Math.max(1, Number(params.limit) || 200), 2000);

    const conds = [];
    if (kind) conds.push(eq(pipelineEvents.kind, kind));
    if (source) conds.push(eq(pipelineEvents.source, source as never));
    if (op) conds.push(eq(pipelineEvents.op, op as Op));
    if (outcome) conds.push(eq(pipelineEvents.outcome, outcome));
    if (errorName) conds.push(eq(pipelineEvents.errorName, errorName));
    if (saveId) conds.push(eq(pipelineEvents.saveId, saveId));
    if (since) conds.push(gte(pipelineEvents.ts, since));

    const baseQuery = db.select().from(pipelineEvents);
    const filtered =
      conds.length > 0 ? baseQuery.where(and(...conds)) : baseQuery;
    const rows = await filtered.orderBy(desc(pipelineEvents.ts)).limit(limit);
    return { rows: rows.map(toWire) };
  },

  /* Facet counts for the panel's filter chips. One round-trip instead
   * of the four it'd take to assemble the same view client-side. */
  async "pipeline.events.facets"(params) {
    const db = await getDb();
    const sinceMs = Number(params.sinceMs);
    const since =
      Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs) : null;
    const where = since ? gte(pipelineEvents.ts, since) : undefined;

    const groupedBy = async (
      col:
        | typeof pipelineEvents.kind
        | typeof pipelineEvents.source
        | typeof pipelineEvents.op
        | typeof pipelineEvents.outcome
        | typeof pipelineEvents.errorName,
    ): Promise<FacetEntry[]> => {
      const base = db
        .select({ value: col, count: sql<number>`count(*)` })
        .from(pipelineEvents)
        .groupBy(col)
        .orderBy(desc(sql`count(*)`))
        .limit(50);
      const rows = await (where ? base.where(where) : base);
      return rows
        .filter((r) => r.value != null && String(r.value) !== "")
        .map((r) => ({ value: String(r.value), count: Number(r.count) }));
    };

    const [kinds, sources, ops, outcomes, errorNames] = await Promise.all([
      groupedBy(pipelineEvents.kind),
      groupedBy(pipelineEvents.source),
      groupedBy(pipelineEvents.op),
      groupedBy(pipelineEvents.outcome),
      groupedBy(pipelineEvents.errorName),
    ]);
    return { kinds, sources, ops, outcomes, errorNames };
  },

  /* "Show me failing harvest_metadata grouped by error in the last
   * hour" — the canonical wide-event query, exposed as a one-click
   * panel button so users don't have to remember the SQL. */
  async "pipeline.events.failuresByError"(params) {
    const db = await getDb();
    const sinceMs = Number(params.sinceMs);
    const since =
      Number.isFinite(sinceMs) && sinceMs > 0
        ? new Date(sinceMs)
        : new Date(Date.now() - 60 * 60_000);
    const rows = await db
      .select({
        errorName: pipelineEvents.errorName,
        source: pipelineEvents.source,
        op: pipelineEvents.op,
        count: sql<number>`count(*)`,
      })
      .from(pipelineEvents)
      .where(
        and(
          eq(pipelineEvents.outcome, "failed"),
          gte(pipelineEvents.ts, since),
        ),
      )
      .groupBy(
        pipelineEvents.errorName,
        pipelineEvents.source,
        pipelineEvents.op,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(100);
    return {
      sinceMs: since.getTime(),
      rows: rows.map((r) => ({
        errorName: r.errorName,
        source: r.source,
        op: r.op,
        count: Number(r.count),
      })),
    };
  },
};
