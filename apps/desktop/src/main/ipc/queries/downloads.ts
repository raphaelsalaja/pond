import { OPS, SOURCES, saves, tasks } from "@pond/schema/db";
import type { Op, Source } from "@pond/schema/db";
import { pipelineEvents } from "@pond/schema/events";
import type { PipelineEventRow, SaveIngestEvent } from "@pond/schema/events";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { clearUnfinishedDownloads } from "../../core/clear-unfinished-downloads";
import { executeBatch, withMutationScope } from "../../core/executor";
import { downloadActivity } from "../../core/pipeline/download-activity";
import { pipelineSnapshot } from "../../core/pipeline/reconciler-client";
import { recordBatchForUndo } from "../../core/undo";
import { getDb } from "../../db";
import { cursorFor } from "./downloads-page";
import { query, TrimmedTextParam } from "./params";
import type { QueryHandlerMap } from "./params";

const PAGE_MAX = 200;
const PAGE_DEFAULT = 50;

export interface DownloadHistoryRow {
  id: number;
  saveId: string;
  title: string | null;
  url: string;
  source: Source;
  outcome: SaveIngestEvent["outcome"];
  durationMs: number;
  attempts: number;
  failedOp: Op | null;
  error: { name: string; message: string } | null;
  ts: number;
}

const LimitParam = z.coerce
  .number()
  .nullish()
  .catch(Number.NaN)
  .transform((value) =>
    value !== null && value !== undefined && Number.isFinite(value)
      ? Math.min(Math.max(Math.trunc(value), 1), PAGE_MAX)
      : PAGE_DEFAULT,
  );

const CursorParam = z
  .object({ ts: z.number(), id: z.number() })
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

const SourceListParam = z
  .array(z.enum(SOURCES).nullable().catch(null))
  .catch([])
  .transform((values) => values.filter((value) => value !== null));

const OpListParam = z
  .array(z.enum(OPS).nullable().catch(null))
  .catch([])
  .transform((values) => values.filter((value) => value !== null));

type HistoryRow = Pick<
  PipelineEventRow,
  "id" | "ts" | "saveId" | "source" | "payload"
> & {
  title: string | null;
  url: string | null;
};

function toHistoryRow(row: HistoryRow): DownloadHistoryRow | null {
  const payload = row.payload;
  if (payload.kind !== "save.ingest.completed") {
    return null;
  }
  const saveId = payload.saveId ?? row.saveId;
  if (!saveId) {
    return null;
  }
  return {
    id: row.id,
    saveId,
    title: row.title,
    url: payload.url || row.url || "",
    source: payload.source ?? row.source ?? "web",
    outcome: payload.outcome,
    durationMs: payload.durationMs ?? 0,
    attempts: payload.attempts ?? 0,
    failedOp: payload.failedOp ?? null,
    error: payload.error ?? null,
    ts: row.ts.getTime(),
  };
}

export const downloadsQueries = {
  "downloads.activity": query(z.object({}), () => downloadActivity.snapshot()),
  "pipeline.status": query(z.object({}), () => pipelineSnapshot()),

  "downloads.clearUnfinished": query(z.object({}), () =>
    withMutationScope(async () =>
      clearUnfinishedDownloads(
        await getDb(),
        async (transactions) => {
          await executeBatch(transactions);
        },
        recordBatchForUndo,
      ),
    ),
  ),

  "downloads.ingestingOrFailed": query(z.object({}), async () => {
    const db = await getDb();
    const rows = await db
      .select({ id: saves.id })
      .from(saves)
      .where(
        and(
          isNull(saves.deletedAt),
          ne(saves.source, "local"),
          inArray(saves.status, ["ingesting", "failed", "skipped"]),
        ),
      );
    return rows.map((row) => row.id);
  }),

  /** Task rows change state without a sync action, so the downloads view polls for what is in flight. */
  "pipeline.inflight": query(z.object({}), async () => {
    const db = await getDb();
    const rows = await db
      .selectDistinct({ saveId: tasks.saveId })
      .from(tasks)
      .where(eq(tasks.status, "running"));
    return rows.map((row) => row.saveId);
  }),

  "downloads.history": query(
    z.object({
      limit: LimitParam,
      cursor: CursorParam,
      q: TrimmedTextParam,
      sources: SourceListParam,
      ops: OpListParam,
    }),
    async ({ limit, cursor, q, sources, ops }) => {
      const db = await getDb();
      const clauses = [
        eq(pipelineEvents.kind, "save.ingest.completed"),
        eq(pipelineEvents.outcome, "complete"),
        or(isNull(pipelineEvents.source), ne(pipelineEvents.source, "local")),
      ];
      if (sources.length > 0) {
        clauses.push(inArray(pipelineEvents.source, sources));
      }
      if (ops.length > 0) {
        clauses.push(inArray(pipelineEvents.op, ops));
      }
      if (cursor) {
        const older = or(
          lt(pipelineEvents.ts, new Date(cursor.ts)),
          and(
            eq(pipelineEvents.ts, new Date(cursor.ts)),
            lt(pipelineEvents.id, cursor.id),
          ),
        );
        if (older) {
          clauses.push(older);
        }
      }
      if (q) {
        const pattern = `%${q.replaceAll("%", "").replaceAll("_", "")}%`;
        const match = or(
          like(saves.title, pattern),
          like(saves.url, pattern),
          like(pipelineEvents.errorMessage, pattern),
          sql`json_extract(${pipelineEvents.payload}, '$.url') like ${pattern}`,
        );
        if (match) {
          clauses.push(match);
        }
      }

      const raw = db
        .select({
          id: pipelineEvents.id,
          ts: pipelineEvents.ts,
          saveId: pipelineEvents.saveId,
          source: pipelineEvents.source,
          payload: pipelineEvents.payload,
          title: saves.title,
          url: saves.url,
        })
        .from(pipelineEvents)
        .leftJoin(saves, eq(pipelineEvents.saveId, saves.id))
        .where(and(...clauses))
        .orderBy(desc(pipelineEvents.ts), desc(pipelineEvents.id))
        .limit(limit + 1)
        .all();

      const mapped = raw
        .map(toHistoryRow)
        .filter((row): row is DownloadHistoryRow => row !== null);
      const hasMore = mapped.length > limit;
      const rows = hasMore ? mapped.slice(0, limit) : mapped;
      return {
        rows,
        nextCursor: hasMore ? cursorFor(rows) : null,
      };
    },
  ),
} satisfies QueryHandlerMap;
