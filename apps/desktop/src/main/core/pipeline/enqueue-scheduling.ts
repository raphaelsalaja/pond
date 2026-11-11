import { type NewTask, type Source, saves, tasks } from "@pond/schema/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { type Db, getDb } from "../../db";
import { persistSave } from "../persist-save";
import {
  isInteractiveTrigger,
  TaskPayloadSchema,
  withInteractivePriority,
} from "./priority";
import {
  createRetryGeneration,
  type RetryGenerationResult,
} from "./queue-generations";
import { kickReconciler } from "./reconciler-client";
import { maxAttemptsFor, planOps } from "./specs";

export function createPendingTasks(
  saveId: string,
  source: Source,
  now: Date,
  trigger: string | undefined,
  createId: () => string = ulid,
  generationId?: string | null,
): NewTask[] {
  const interactive = isInteractiveTrigger(trigger);
  return planOps(source).map((op) => {
    const row: NewTask = {
      id: createId(),
      saveId,
      source,
      op,
      generationId: generationId ?? null,
      status: "pending",
      attempts: 0,
      maxAttempts: maxAttemptsFor(op),
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (interactive) row.payload = withInteractivePriority();
    return row;
  });
}

async function promoteInteractiveTasks(saveId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const rows = db
    .select({ id: tasks.id, payload: tasks.payload })
    .from(tasks)
    .where(and(eq(tasks.saveId, saveId), eq(tasks.status, "pending")))
    .all();
  for (const row of rows) {
    db.update(tasks)
      .set({
        payload: withInteractivePriority(TaskPayloadSchema.parse(row.payload)),
        nextRunAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, row.id))
      .run();
  }
}

export async function promoteInteractiveSaveTasks(
  saveId: string,
): Promise<void> {
  await promoteInteractiveTasks(saveId);
}

export async function rependArchiveForCookies(saveId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  if (!rependArchiveTasks(db, saveId, now)) return;
  await persistSave(
    saveId,
    { status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null },
    { actorReason: "pipeline:enqueue:page-cookies" },
  );
}

export function rependArchiveTasks(db: Db, saveId: string, now: Date): boolean {
  const running = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.saveId, saveId), eq(tasks.status, "running")))
    .get();
  if (running) return false;
  db.update(tasks)
    .set({
      status: "pending",
      attempts: 0,
      generationId: null,
      cancellationFence: sql`${tasks.cancellationFence} + 1`,
      deferredReason: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      startedAt: null,
      failedAt: null,
      completedAt: null,
      lastError: null,
      nextRunAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(tasks.saveId, saveId),
        or(
          inArray(tasks.op, ["archive_page", "finalize"]),
          inArray(tasks.status, ["dead", "blocked"]),
        ),
      ),
    )
    .run();
  return true;
}

export async function resetTasksForSave(
  saveId: string,
  reason: string,
  generationId?: string | null,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  db.update(tasks)
    .set({
      status: "pending",
      attempts: 0,
      generationId: generationId ?? null,
      cancellationFence: sql`${tasks.cancellationFence} + 1`,
      deferredReason: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      startedAt: null,
      failedAt: null,
      completedAt: null,
      lastError: null,
      nextRunAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.saveId, saveId))
    .run();
  db.update(saves)
    .set({ status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null })
    .where(eq(saves.id, saveId))
    .run();
  if (isInteractiveTrigger(reason)) await promoteInteractiveTasks(saveId);
  log.info("[pond pipeline:enqueue] reset tasks", { saveId, reason });
}

export async function retryFailedSaves(
  ids?: readonly string[],
  options?: Parameters<typeof createRetryGeneration>[1],
): Promise<number> {
  const result = await retryFailedSavesGeneration(ids, options);
  return result.queued;
}

async function retryFailedSavesGeneration(
  ids?: readonly string[],
  options?: Parameters<typeof createRetryGeneration>[1],
): Promise<RetryGenerationResult> {
  const result = await createRetryGeneration(ids, options);
  log.info("[pond pipeline:enqueue] retry failed generation", {
    generationId: result.generationId,
    requeued: result.queued,
    scoped: ids != null && ids.length > 0,
  });
  if (result.queued > 0) kickReconciler();
  return result;
}
