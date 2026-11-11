import {
  queueGenerations,
  type Source,
  saves,
  type Task,
  tasks,
} from "@pond/schema/db";
import type { PipelineTaskEvent } from "@pond/schema/events";
import { sourceLabel } from "@pond/schema/sources";
import { and, eq, inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { commitSaveIngestEvent, toErrorInfo } from "../../lib/wide-event";
import { persistSave } from "../persist-save";
import { listAccountsForSource, patchAccountSync } from "../sync/accounts";
import { emit } from "../sync/sync-status";
import {
  AuthRequiredError,
  RateLimitedError,
  TransientError,
} from "./extractors/errors";
import {
  noteTransientFailure,
  setSourceCooldown,
  snapshotSourceGate,
} from "./rate-governor";
import {
  type DueTask,
  isSourceTask,
  metrics,
  NON_FATAL_OPS,
  WorkerWatchdogError,
} from "./reconciler-config";
import { classifyError } from "./retry-policy";
import { stopSourceForSignIn } from "./source-admission";
import { FinalizeIncompleteError } from "./workers/finalize";

export async function enrichTaskEventWithSave(
  ev: PipelineTaskEvent,
): Promise<void> {
  try {
    const db = await getDb();
    const row = db
      .select({
        sourceId: saves.sourceId,
        url: saves.url,
      })
      .from(saves)
      .where(eq(saves.id, ev.saveId))
      .get();
    if (row) {
      ev.sourceId = row.sourceId ?? null;
      ev.url = row.url ?? null;
    }
  } catch (error) {
    log.warn("[pond pipeline] task event enrichment failed", ev.saveId, error);
  }
}

export function gateForSource(source: Source): PipelineTaskEvent["gate"] {
  const snap = snapshotSourceGate();
  const hit = snap.find((e) => e.source === source);
  return hit ? { reason: hit.reason, until: hit.until } : null;
}

function leaseGuard(task: Task) {
  if (!task.leaseToken) return;
  return and(
    eq(tasks.id, task.id),
    eq(tasks.status, "running"),
    eq(tasks.leaseToken, task.leaseToken),
    eq(tasks.cancellationFence, task.cancellationFence),
  );
}

export async function markDone(task: Task): Promise<boolean> {
  const guard = leaseGuard(task);
  if (!guard) return false;
  const db = await getDb();
  const result = db
    .update(tasks)
    .set({
      status: "done",
      attempts: task.attempts + 1,
      lastError: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(guard)
    .run();
  return result.changes === 1;
}

export interface FailureResult {
  outcome: "deferred" | "blocked" | "failed" | "dead";
  nextRunAt: number | null;
  recordedAttempts: number;
  settled: boolean;
}

export async function handleFailure(
  task: DueTask,
  cause: unknown,
): Promise<FailureResult> {
  const guard = leaseGuard(task);
  if (!guard) {
    return {
      outcome: "deferred",
      nextRunAt: null,
      recordedAttempts: task.attempts,
      settled: false,
    };
  }
  if (cause instanceof FinalizeIncompleteError) {
    const db = await getDb();
    const nextRun = new Date(Date.now() + 30_000);
    const result = db
      .update(tasks)
      .set({
        status: "deferred",
        deferredReason: "retry_backoff",
        nextRunAt: nextRun,
        lastError: cause.message,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(guard)
      .run();
    return {
      outcome: "deferred",
      nextRunAt: nextRun.getTime(),
      recordedAttempts: task.attempts,
      settled: result.changes === 1,
    };
  }

  if (isSourceTask(task.op)) {
    const source = task.source;
    if (cause instanceof AuthRequiredError) {
      if (await stopSourceForSignIn(source)) {
        log.warn(
          `[pond pipeline] ${source} needs sign-in; parked its queued requests`,
        );
        await markSignInNeeded(source, task.saveId).catch((error) =>
          log.warn("[pond pipeline] sign-in status update failed", error),
        );
      }
    } else if (cause instanceof RateLimitedError) {
      const ms = (cause.retryAfterSec ?? 60) * 1000;
      setSourceCooldown(source, ms);
    } else if (
      cause instanceof TransientError ||
      cause instanceof WorkerWatchdogError
    ) {
      noteTransientFailure(source);
    }
  }

  const decision = classifyError(cause, {
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  });
  if (decision.status === "blocked") metrics.tasksBlocked++;
  const db = await getDb();

  const nonFatalTerminal =
    decision.status === "dead" && NON_FATAL_OPS.has(task.op);
  if (nonFatalTerminal) {
    metrics.tasksFailed++;
    const result = db
      .update(tasks)
      .set({
        status: "done",
        attempts: task.attempts + 1,
        nextRunAt: decision.nextRunAt,
        lastError: decision.lastError,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(guard)
      .run();
    if (result.changes === 1) await maybeFinalizeSave(task.saveId);
    return {
      outcome: "failed",
      nextRunAt: decision.nextRunAt.getTime(),
      recordedAttempts: task.attempts + 1,
      settled: result.changes === 1,
    };
  }

  const result = db
    .update(tasks)
    .set({
      status: decision.status,
      attempts: decision.recordAttempt ? task.attempts + 1 : task.attempts,
      nextRunAt: decision.nextRunAt,
      lastError: decision.lastError,
      deferredReason: decision.deferredReason,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      failedAt: decision.status === "dead" ? new Date() : null,
      completedAt: decision.status === "dead" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(guard)
    .run();

  const recordedAttempts = decision.recordAttempt
    ? task.attempts + 1
    : task.attempts;
  if (result.changes !== 1) {
    return {
      outcome: "deferred",
      nextRunAt: null,
      recordedAttempts: task.attempts,
      settled: false,
    };
  }
  /* A harvest that needs a sign-in waits a day. A refreshed save, or a capture that already has files, should not look like it is still saving in the meantime. */
  if (decision.status === "blocked" && task.op === "harvest_metadata") {
    const current = db
      .select({ status: saves.status, files: saves.files })
      .from(saves)
      .where(eq(saves.id, task.saveId))
      .get();
    const generation = task.generationId
      ? db
          .select({ kind: queueGenerations.kind })
          .from(queueGenerations)
          .where(eq(queueGenerations.id, task.generationId))
          .get()
      : undefined;
    const refresh = generation?.kind === "refresh";
    if (
      current?.status === "ingesting" &&
      (refresh || (current.files?.length ?? 0) > 0)
    ) {
      /* The renderer tells the user to sign in only when the block came from a refresh they asked for. */
      await persistSave(
        task.saveId,
        { status: "complete", ingestCompletedAt: new Date() },
        {
          actorReason: refresh
            ? "pipeline:refresh-blocked"
            : "pipeline:blocked-keep-files",
        },
      );
    }
  }
  if (decision.status === "dead") {
    metrics.tasksFailed++;
    const current = db
      .select({ status: saves.status })
      .from(saves)
      .where(eq(saves.id, task.saveId))
      .get();
    if (current?.status === "ingesting") {
      await persistSave(
        task.saveId,
        { status: "failed" },
        { actorReason: "pipeline:failed" },
      );
      db.update(tasks)
        .set({
          status: "dead",
          lastError: `blocked by failed ${task.op}`,
          failedAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.saveId, task.saveId),
            inArray(tasks.status, ["pending", "deferred"]),
          ),
        )
        .run();
      metrics.cascadeEvents += 1;
    }
    if (current?.status === "ingesting") {
      void commitSaveIngestEvent(task.saveId, {
        outcome: "failed",
        failedOp: task.op,
        error: toErrorInfo(cause),
      });
    }
  }
  return {
    outcome:
      decision.status === "dead"
        ? "dead"
        : decision.status === "blocked"
          ? "blocked"
          : "deferred",
    nextRunAt: decision.nextRunAt.getTime(),
    recordedAttempts,
    settled: true,
  };
}

async function markSignInNeeded(source: Source, saveId: string): Promise<void> {
  const db = await getDb();
  const owner = db
    .select({ accountId: saves.accountId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get()?.accountId;
  const accounts = await listAccountsForSource(source);
  /** Matches partitionForIngest: a Save without its own Account harvests through the source's first Account. */
  const account =
    accounts.find((candidate) => candidate.id === owner) ?? accounts[0];
  if (!account) return;
  await patchAccountSync(account.id, { lastError: "auth_required" });
  emit({
    accountId: account.id,
    source,
    state: "auth_required",
    message: `Sign in to ${sourceLabel(source)} again to resume downloads.`,
    lastError: "auth_required",
  });
}

export async function maybeFinalizeSave(saveId: string): Promise<void> {
  const db = await getDb();
  const save = db
    .select({ status: saves.status })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get();
  if (save?.status !== "ingesting") return;
  const rows = db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.saveId, saveId))
    .all();
  if (rows.length === 0) return;
  const allDone = rows.every((t) => t.status === "done");
  if (!allDone) return;
  await persistSave(
    saveId,
    { status: "complete", ingestCompletedAt: new Date() },
    { actorReason: "pipeline:tasks-complete" },
  );
}
