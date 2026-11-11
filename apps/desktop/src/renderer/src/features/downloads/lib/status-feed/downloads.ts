import {
  OPS,
  type Op,
  SOURCES,
  type Source,
  type TaskDeferredReason,
} from "@pond/schema/db";
import { INGEST_OUTCOMES } from "@pond/schema/events";
import { hostToSource } from "@pond/schema/sources";
import type { WireTask } from "@shared/wire";
import { z } from "zod";
import type { Save } from "@/features/saves/types";
import { humanizeError, preferIngestError, stageLabel } from "./queue";

export const HistoryPageSchema = z.object({
  rows: z.array(
    z.object({
      id: z.number(),
      saveId: z.string(),
      title: z.string().nullable(),
      url: z.string(),
      source: z.enum(SOURCES),
      outcome: z.enum(INGEST_OUTCOMES),
      durationMs: z.number(),
      attempts: z.number(),
      failedOp: z.enum(OPS).nullable(),
      error: z.object({ name: z.string(), message: z.string() }).nullable(),
      ts: z.number(),
    }),
  ),
  nextCursor: z.object({ ts: z.number(), id: z.number() }).nullable(),
});

type HistoryRow = z.infer<typeof HistoryPageSchema>["rows"][number];

export type HistoryCursor = z.infer<typeof HistoryPageSchema>["nextCursor"];

export const PipelineStatusSchema = z.object({ paused: z.boolean() });

export type DownloadStatus =
  | "waiting"
  | "running"
  | "retrying"
  | "parked"
  | "blocked"
  | "failed"
  | "cancelled"
  | "dead"
  | "skipped"
  | "complete";

export type StatusFilter =
  | "active"
  | "waiting"
  | "failed"
  | "cancelled"
  | "skipped"
  | "complete";

interface DownloadTaskState {
  deferredReason: TaskDeferredReason | null;
  attempts: number;
  maxAttempts: number;
}

export interface DownloadRow {
  id: string;
  saveId: string;
  name: string;
  url: string;
  source: Source;
  status: DownloadStatus;
  stage: string | null;
  op: Op | null;
  progress: number | null;
  attempts: number;
  error: string | null;
  /** Unformatted, so the status reason can read the error class main recorded. */
  lastError?: string | null;
  task?: DownloadTaskState | null;
  ts: number;
  durationMs: number | null;
  nextRunAt?: number | null;
  live: boolean;
  interactive?: boolean;
}

export interface DownloadFilters {
  statuses: ReadonlySet<StatusFilter>;
  sources: ReadonlySet<Source>;
  q: string;
}

export const STATUS_FILTER_OPTIONS: readonly {
  id: StatusFilter;
  label: string;
}[] = [
  { id: "active", label: "Active" },
  { id: "waiting", label: "Waiting" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Canceled" },
  { id: "skipped", label: "Skipped" },
  { id: "complete", label: "Completed" },
];

const DEFAULT_STATUS_FILTERS: readonly StatusFilter[] =
  STATUS_FILTER_OPTIONS.map((option) => option.id).filter(
    (id) => id !== "complete",
  );

export function defaultDownloadFilters(): DownloadFilters {
  return {
    statuses: new Set(DEFAULT_STATUS_FILTERS),
    sources: new Set(),
    q: "",
  };
}

function isDefaultStatuses(statuses: ReadonlySet<StatusFilter>): boolean {
  return (
    statuses.size === DEFAULT_STATUS_FILTERS.length &&
    DEFAULT_STATUS_FILTERS.every((id) => statuses.has(id))
  );
}

export function downloadFiltersActive(filters: DownloadFilters): boolean {
  return !isDefaultStatuses(filters.statuses) || filters.sources.size > 0;
}

export function showsCompletedDownloads(filters: DownloadFilters): boolean {
  return filters.statuses.size === 0 || filters.statuses.has("complete");
}

function wasCancelled(save: Save): boolean {
  const stopped = (save.tasks ?? []).filter(
    (t) =>
      t.status === "cancelled" || t.status === "dead" || t.status === "blocked",
  );
  return (
    stopped.length > 0 && stopped.every((task) => task.status === "cancelled")
  );
}

function isRetryingTask(task: WireTask): boolean {
  return task.status === "deferred" && task.deferredReason === "retry_backoff";
}

function liveStatus(save: Save): DownloadStatus | null {
  if (save.status === "skipped") return "skipped";
  if (save.status === "failed") {
    if (wasCancelled(save)) return "cancelled";
    if (save.tasks?.some((task) => task.status === "dead")) return "dead";
    return "failed";
  }
  if (save.status !== "ingesting") return null;
  const tasks = save.tasks ?? [];
  if (tasks.some((t) => t.status === "running")) return "running";
  if (tasks.some((t) => t.status === "blocked")) return "blocked";
  if (tasks.some((t) => t.status === "dead")) return "dead";
  if (tasks.some((t) => t.status === "cancelled")) return "cancelled";
  const next = tasks.find((t) => t.status !== "done");
  if (next && isRetryingTask(next)) return "retrying";
  if (next?.status === "deferred") return "parked";
  return "waiting";
}

function currentTask(save: Save): WireTask | null {
  const tasks = save.tasks ?? [];
  return (
    tasks.find((t) => t.status === "running") ??
    tasks.find((t) => t.status === "dead") ??
    tasks.find((t) => t.status === "blocked") ??
    tasks.find((t) => t.status !== "done") ??
    null
  );
}

function latestTaskError(save: Save): string | null {
  let latest: WireTask | null = null;
  for (const t of save.tasks ?? []) {
    if (t.status === "done" || !t.lastError) continue;
    if (!latest || t.updatedAt > latest.updatedAt) latest = t;
  }
  return latest?.lastError ?? null;
}

function rowError(save: Save): string | null {
  let error: string | null = null;
  for (const t of save.tasks ?? []) {
    if (
      t.status !== "dead" &&
      t.status !== "blocked" &&
      t.status !== "cancelled" &&
      !(t.status === "deferred" && t.lastError)
    ) {
      continue;
    }
    error = preferIngestError(error, t.lastError);
  }
  return error;
}

const DOWNLOAD_STATUS_RANK = {
  running: 0,
  retrying: 1,
  waiting: 2,
  parked: 3,
  blocked: 4,
  failed: 5,
  cancelled: 6,
  dead: 7,
  skipped: 8,
  complete: 9,
} satisfies Record<DownloadStatus, number>;

export function projectLiveDownloads(saves: readonly Save[]): DownloadRow[] {
  const rows: DownloadRow[] = [];
  for (const save of saves) {
    if (save.deletedAt != null || save.source === "local") continue;
    const status = liveStatus(save);
    if (!status) continue;
    const tasks = save.tasks ?? [];
    const done = tasks.filter((t) => t.status === "done").length;
    const task = currentTask(save);
    const op = task?.op ?? null;
    const attempts = tasks.reduce((max, t) => Math.max(max, t.attempts), 0);
    const ts = save.ingestStartedAt ?? save.savedAt ?? save.createdAt;
    const rawError = rowError(save);
    rows.push({
      id: save.id,
      saveId: save.id,
      name: save.title?.trim() || save.url,
      url: save.url,
      source: save.source,
      status,
      stage: op ? stageLabel(op, save.source) : null,
      op,
      progress: tasks.length > 0 ? done / tasks.length : 0,
      attempts,
      error: rawError ? humanizeError(rawError) : null,
      lastError: rawError ?? latestTaskError(save),
      task: task
        ? {
            deferredReason: task.deferredReason ?? null,
            attempts: task.attempts,
            maxAttempts: task.maxAttempts,
          }
        : null,
      ts,
      durationMs: null,
      nextRunAt:
        tasks.find((task) => task.status !== "done")?.nextRunAt ?? null,
      live: true,
      interactive: tasks.some((t) => t.interactive),
    });
  }
  rows.sort(
    (a, b) =>
      DOWNLOAD_STATUS_RANK[a.status] - DOWNLOAD_STATUS_RANK[b.status] ||
      b.ts - a.ts,
  );
  return rows;
}

export function statusBucket(status: DownloadStatus): StatusFilter {
  if (status === "failed" || status === "blocked" || status === "dead")
    return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "skipped") return "skipped";
  if (status === "complete") return "complete";
  if (status === "running") return "active";
  return "waiting";
}

export function downloadRowSource(row: DownloadRow): Source {
  return hostToSource(row.url) ?? row.source;
}

export function matchesDownloadFilters(
  row: DownloadRow,
  filters: DownloadFilters,
): boolean {
  if (
    filters.statuses.size > 0 &&
    !filters.statuses.has(statusBucket(row.status))
  ) {
    return false;
  }
  if (
    filters.sources.size > 0 &&
    !filters.sources.has(downloadRowSource(row))
  ) {
    return false;
  }
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.name, row.url, row.stage, row.error, row.source]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function mergeDownloadRows(
  live: readonly DownloadRow[],
  history: readonly DownloadRow[],
): DownloadRow[] {
  const liveIds = new Set(live.map((r) => r.saveId));
  const extra = history.filter((r) => !liveIds.has(r.saveId));
  return [...live, ...extra];
}

export function historyToDownloadRow(input: HistoryRow): DownloadRow {
  const failed = input.outcome === "failed";
  return {
    id: `history:${input.id}`,
    saveId: input.saveId,
    name: input.title?.trim() || input.url,
    url: input.url,
    source: input.source,
    status: failed ? "failed" : "complete",
    stage: input.failedOp ? stageLabel(input.failedOp, input.source) : "Saved",
    op: input.failedOp,
    progress: null,
    attempts: input.attempts,
    error: failed ? humanizeError(input.error?.message ?? null) : null,
    ts: input.ts,
    durationMs: input.durationMs,
    live: false,
  };
}
