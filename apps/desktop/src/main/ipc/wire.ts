import type { SyncAction, Task } from "@pond/schema/db";
import { toMs } from "@shared/to-ms";
import type {
  WireRow,
  WireSave,
  WireSaveRow,
  WireSyncAction,
  WireSyncPayload,
  WireTask,
} from "@shared/wire";
import { z } from "zod";
import { isInteractiveTask } from "../core/pipeline/priority";
import { slimRawJson } from "../lib/raw-slim";

export type { WireSaveRow as SaveListRow } from "@shared/wire";

interface WireSaveOptions {
  slim?: boolean;
}

export function toWireSave(
  row: WireSaveRow,
  taskRows?: Array<Task>,
  opts?: WireSaveOptions,
): WireSave {
  const wire: WireSave = {
    ...row,
    rawJson: opts?.slim ? slimRawJson(row.rawJson) : row.rawJson,
    savedAt: toMs(row.savedAt) ?? 0,
    createdAt: toMs(row.createdAt) ?? 0,
    deletedAt: toMs(row.deletedAt),
    publishedAt: toMs(row.publishedAt),
    takenAt: toMs(row.takenAt),
    ingestStartedAt: toMs(row.ingestStartedAt),
    ingestCompletedAt: toMs(row.ingestCompletedAt),
  };
  if (taskRows) {
    wire.tasks = taskRows.map(toWireTask);
  }
  return wire;
}

export function toWireSaves(
  rows: Array<WireSaveRow>,
  tasksBySave?: Map<string, Array<Task>>,
  opts?: WireSaveOptions,
): Array<WireSave> {
  return rows.map((row) => toWireSave(row, tasksBySave?.get(row.id), opts));
}

function toWireTask(task: Task): WireTask {
  return {
    op: task.op,
    status: task.status,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    generationId: task.generationId,
    deferredReason: task.deferredReason,
    lastError: task.lastError,
    nextRunAt: toMs(task.nextRunAt) ?? 0,
    leaseExpiresAt: toMs(task.leaseExpiresAt),
    failedAt: toMs(task.failedAt),
    completedAt: toMs(task.completedAt),
    updatedAt: toMs(task.updatedAt) ?? 0,
    interactive: isInteractiveTask(task) || undefined,
  };
}

function isObject(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

const WireRowSchema = z.custom<WireRow>(
  (value) => isObject(value) && !Array.isArray(value),
);
const WirePayloadSchema = z
  .union([z.array(WireRowSchema), WireRowSchema])
  .nullable()
  .catch(null);

export function toWireSyncAction(action: SyncAction): WireSyncAction {
  return {
    ...action,
    createdAt: toMs(action.createdAt) ?? 0,
    data: normaliseDataPayload(action.data),
    prevData: normaliseDataPayload(action.prevData),
  };
}

const TIMESTAMP_KEYS = [
  "savedAt",
  "createdAt",
  "deletedAt",
  "publishedAt",
] as const;

function normaliseDataPayload(value: SyncAction["data"]): WireSyncPayload {
  const payload = WirePayloadSchema.parse(value);
  if (payload === null) {
    return null;
  }
  return Array.isArray(payload)
    ? payload.map(normaliseRow)
    : normaliseRow(payload);
}

function normaliseRow(row: WireRow): WireRow {
  const stamped = TIMESTAMP_KEYS.flatMap((key) =>
    key in row ? [[key, toMs(row[key])] as const] : [],
  );
  return { ...row, ...Object.fromEntries(stamped) };
}
