import type { Op, Save, SyncAction, Task, TaskStatus } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { toMs } from "@shared/to-ms";
import { slimRawJson } from "../lib/raw-slim";

interface WireTask {
  op: Op;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRunAt: number;
  updatedAt: number;
}

type WireSave = Omit<
  Save,
  | "savedAt"
  | "createdAt"
  | "deletedAt"
  | "publishedAt"
  | "ingestStartedAt"
  | "ingestCompletedAt"
> & {
  savedAt: number;
  createdAt: number;
  deletedAt: number | null;
  publishedAt: number | null;
  ingestStartedAt: number | null;
  ingestCompletedAt: number | null;
  tasks?: WireTask[];
};

interface WireSaveOptions {
  /** Replace rawJson with a tiny projection; the grid never reads the full blob. */
  slim?: boolean;
}

export function toWireSave(
  row: Save,
  taskRows?: Task[],
  opts?: WireSaveOptions,
): WireSave {
  return {
    ...row,
    rawJson: opts?.slim
      ? slimRawJson(row.rawJson as RawJson | null)
      : row.rawJson,
    savedAt: toMs(row.savedAt) ?? 0,
    createdAt: toMs(row.createdAt) ?? 0,
    deletedAt: toMs(row.deletedAt),
    publishedAt: toMs(row.publishedAt),
    ingestStartedAt: toMs(row.ingestStartedAt),
    ingestCompletedAt: toMs(row.ingestCompletedAt),
    ...(taskRows ? { tasks: taskRows.map(toWireTask) } : {}),
  };
}

export function toWireSaves(
  rows: Save[],
  tasksBySave?: Map<string, Task[]>,
  opts?: WireSaveOptions,
): WireSave[] {
  return rows.map((row) => toWireSave(row, tasksBySave?.get(row.id), opts));
}

function toWireTask(task: Task): WireTask {
  return {
    op: task.op,
    status: task.status,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    lastError: task.lastError,
    nextRunAt: toMs(task.nextRunAt) ?? 0,
    updatedAt: toMs(task.updatedAt) ?? 0,
  };
}

export function toWireSyncAction(action: SyncAction): SyncAction {
  return {
    ...action,
    createdAt: toMs(action.createdAt) ?? 0,
    data: normaliseDataPayload(action.data),
    prevData: normaliseDataPayload(action.prevData),
  } as unknown as SyncAction;
}

const TIMESTAMP_KEYS = [
  "savedAt",
  "createdAt",
  "deletedAt",
  "publishedAt",
] as const;

function normaliseDataPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normaliseDataPayload);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const key of TIMESTAMP_KEYS) {
    if (key in out) out[key] = toMs(out[key]);
  }
  return out;
}
