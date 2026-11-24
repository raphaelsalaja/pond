import { saves, tasks } from "@pond/schema/db";
import type { Op } from "@pond/schema/db";
import { pipelineEvents } from "@pond/schema/events";
import type {
  ErrorInfo,
  IngestOutcome,
  PipelineTaskEvent,
  SaveIngestEvent,
  SyncRunEvent,
  WideEvent,
} from "@pond/schema/events";
import { desc, eq, lt } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";

type WithoutKind<E extends WideEvent> = Omit<E, "kind">;

export function startTaskEvent(
  base: Partial<WithoutKind<PipelineTaskEvent>>,
): PipelineTaskEvent {
  return {
    kind: "pipeline.task.completed",
    ts: Date.now(),
    saveId: base.saveId ?? "",
    source: base.source ?? "twitter",
    sourceId: base.sourceId ?? null,
    url: base.url ?? null,
    op: base.op ?? "harvest_metadata",
    taskId: base.taskId ?? "",
    outcome: base.outcome ?? "ok",
    durationMs: base.durationMs ?? 0,
    attempts: base.attempts ?? 0,
    maxAttempts: base.maxAttempts ?? 0,
    error: base.error ?? null,
    trigger: base.trigger ?? null,
    nextRunAt: base.nextRunAt ?? null,
    gate: base.gate ?? null,
    pipeline: base.pipeline ?? { inflight: 0, paused: false },
  };
}

export function startSyncEvent(
  base: Partial<WithoutKind<SyncRunEvent>>,
): SyncRunEvent {
  return {
    kind: "sync.run.completed",
    ts: Date.now(),
    source: base.source ?? "twitter",
    accountId: base.accountId ?? null,
    trigger: base.trigger ?? "manual",
    outcome: base.outcome ?? "ok",
    durationMs: base.durationMs ?? 0,
    harvest: base.harvest ?? null,
    enqueue: base.enqueue ?? null,
    error: base.error ?? null,
    lockHeldMs: base.lockHeldMs ?? null,
    watchdogTripped: base.watchdogTripped ?? false,
  };
}

function startIngestEvent(
  base: Partial<WithoutKind<SaveIngestEvent>>,
): SaveIngestEvent {
  return {
    kind: "save.ingest.completed",
    ts: Date.now(),
    saveId: base.saveId ?? "",
    source: base.source ?? "twitter",
    sourceId: base.sourceId ?? null,
    url: base.url ?? "",
    outcome: base.outcome ?? "complete",
    durationMs: base.durationMs ?? 0,
    attempts: base.attempts ?? 0,
    failedOp: base.failedOp ?? null,
    error: base.error ?? null,
    fileCount: base.fileCount ?? 0,
    trigger: base.trigger ?? null,
  };
}

export async function commitSaveIngestEvent(
  saveId: string,
  override: {
    outcome: IngestOutcome;
    failedOp?: Op | null;
    error?: ErrorInfo | null;
    trigger?: string | null;
  },
): Promise<void> {
  try {
    const db = await getDb();
    const save = db.select().from(saves).where(eq(saves.id, saveId)).get();
    if (!save) {
      return;
    }
    const taskRows = db
      .select({ attempts: tasks.attempts })
      .from(tasks)
      .where(eq(tasks.saveId, saveId))
      .all();
    const attempts = taskRows.reduce((sum, t) => sum + (t.attempts ?? 0), 0);
    const start = save.ingestStartedAt ?? save.savedAt ?? save.createdAt;
    const durationMs = start
      ? Math.max(0, Date.now() - new Date(start).getTime())
      : 0;
    const event = startIngestEvent({
      saveId,
      source: save.source,
      sourceId: save.sourceId,
      url: save.url,
      outcome: override.outcome,
      durationMs,
      attempts,
      failedOp: override.failedOp ?? null,
      error: override.error ?? null,
      fileCount: (save.files ?? []).length,
      trigger: override.trigger ?? null,
    });
    await commitEvent(event);
  } catch (error) {
    log.warn("[pond events] save-ingest commit failed", error);
  }
}

export function toErrorInfo(cause: unknown): ErrorInfo | null {
  if (!cause) {
    return null;
  }
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message };
  }
  return { name: "Error", message: String(cause) };
}

export async function commitEvent(ev: WideEvent): Promise<void> {
  try {
    const db = await getDb();
    const inserted = db
      .insert(pipelineEvents)
      .values({
        ts: new Date(ev.ts),
        kind: ev.kind,
        saveId: "saveId" in ev ? (ev.saveId ?? null) : null,
        source: ev.source ?? null,
        accountId: "accountId" in ev ? (ev.accountId ?? null) : null,
        op: "op" in ev ? ev.op : null,
        outcome:
          "outcome" in ev
            ? ev.outcome
            : "phase" in ev
              ? ev.phase
              : `${ev.from}:${ev.to}`,
        durationMs: "durationMs" in ev ? (ev.durationMs ?? null) : null,
        attempts: "attempts" in ev ? (ev.attempts ?? null) : null,
        errorName: "error" in ev ? (ev.error?.name ?? null) : null,
        errorMessage: "error" in ev ? (ev.error?.message ?? null) : null,
        trigger: "trigger" in ev ? (ev.trigger ?? null) : null,
        payload: ev,
      })
      .run();
    if (Number(inserted.lastInsertRowid) % 100 === 0) {
      const boundary = db
        .select({ id: pipelineEvents.id })
        .from(pipelineEvents)
        .orderBy(desc(pipelineEvents.id))
        .limit(1)
        .offset(5000)
        .get();
      if (boundary) {
        db.delete(pipelineEvents)
          .where(lt(pipelineEvents.id, boundary.id))
          .run();
      }
    }
  } catch (error) {
    log.warn("[pond events] commit failed", error);
  }
  log.info(formatSummary(ev));
}

function formatSummary(ev: WideEvent): string {
  switch (ev.kind) {
    case "pipeline.task.attempt":
      return `[attempt ${ev.source}/${ev.op}] ${ev.phase} · attempt ${ev.attempt} · save=${ev.saveId.slice(0, 8)}`;
    case "pipeline.source-gate.transition":
      return `[gate ${ev.source}] ${ev.from}:${ev.to} · trigger=${ev.trigger}`;
    case "pipeline.task.completed": {
      const tag = `[task ${ev.source}/${ev.op}]`;
      const meta: Array<string> = [
        ev.outcome,
        `${ev.durationMs}ms`,
        `attempt ${ev.attempts}/${ev.maxAttempts}`,
        `save=${ev.saveId.slice(0, 8)}`,
      ];
      if (ev.error) {
        meta.push(`${ev.error.name}: ${ev.error.message}`);
      }
      if (ev.gate) {
        meta.push(`gate=${ev.gate.reason}`);
      }
      if (ev.nextRunAt) {
        meta.push(`nextRunAt=+${Math.round((ev.nextRunAt - ev.ts) / 1000)}s`);
      }
      return `${tag} ${meta.join(" · ")}`;
    }
    case "sync.run.completed": {
      const tag = `[sync ${ev.source}]`;
      const meta: Array<string> = [
        ev.outcome,
        `${Math.round(ev.durationMs / 100) / 10}s`,
        `trigger=${ev.trigger}`,
      ];
      if (ev.harvest) {
        meta.push(
          `seen=${ev.harvest.seen ?? 0} fresh=${ev.harvest.fresh ?? 0}`,
        );
      }
      if (ev.enqueue) {
        meta.push(`queued=${ev.enqueue.succeeded} failed=${ev.enqueue.failed}`);
      }
      if (ev.watchdogTripped) {
        meta.push("watchdog");
      }
      if (ev.error) {
        meta.push(`${ev.error.name}: ${ev.error.message}`);
      }
      return `${tag} ${meta.join(" · ")}`;
    }
    case "save.ingest.completed": {
      const tag = `[ingest ${ev.source}]`;
      const meta: Array<string> = [
        ev.outcome,
        `${Math.round(ev.durationMs / 100) / 10}s`,
        `save=${ev.saveId.slice(0, 8)}`,
        `attempts=${ev.attempts}`,
      ];
      if (ev.failedOp) {
        meta.push(`failedAt=${ev.failedOp}`);
      }
      if (ev.error) {
        meta.push(`${ev.error.name}: ${ev.error.message}`);
      }
      if (ev.fileCount) {
        meta.push(`files=${ev.fileCount}`);
      }
      return `${tag} ${meta.join(" · ")}`;
    }
  }
}
