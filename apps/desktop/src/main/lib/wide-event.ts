import { type Op, saves, tasks } from "@pond/schema/db";
import {
  type ErrorInfo,
  type IngestOutcome,
  type PipelineTaskEvent,
  pipelineEvents,
  type SaveIngestEvent,
  type SyncRunEvent,
  type WideEvent,
} from "@pond/schema/events";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";

/* The wide-event substrate.
 *
 * `startEvent` returns a typed builder you can mutate over the life of
 * a unit of work — populating fields as the request flows — then
 * `commitEvent` writes one row to `pipeline_events` and emits a single
 * human-readable line to `electron-log`. The scattered "[pond ...]"
 * narration that used to live around the producer dies as a side
 * effect: one canonical record per unit of work replaces the journal
 * of half-thoughts it used to take to reconstruct the same story.
 *
 * Storage layer is SQLite (queryable from the Activity panel + bug
 * reports). The summary line keeps `tail -f main.log` legible without
 * us paying for it twice.
 */

type WithoutKind<E extends WideEvent> = Omit<E, "kind">;

export function startTaskEvent(
  base: Partial<WithoutKind<PipelineTaskEvent>>,
): PipelineTaskEvent {
  return {
    kind: "pipeline.task.completed",
    ts: Date.now(),
    saveId: base.saveId ?? "",
    source: base.source ?? ("twitter" as PipelineTaskEvent["source"]),
    sourceId: base.sourceId ?? null,
    url: base.url ?? null,
    op: base.op ?? ("harvest_metadata" as PipelineTaskEvent["op"]),
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
    source: base.source ?? ("twitter" as SyncRunEvent["source"]),
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

export function startIngestEvent(
  base: Partial<WithoutKind<SaveIngestEvent>>,
): SaveIngestEvent {
  return {
    kind: "save.ingest.completed",
    ts: Date.now(),
    saveId: base.saveId ?? "",
    source: base.source ?? ("twitter" as SaveIngestEvent["source"]),
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

/* Convenience for the two save-terminal call sites (finalize success
 * + reconciler cascade-failure). Builds and commits a single
 * `save.ingest.completed` row by reading the current save + tasks
 * state. Best-effort — if the save vanished we just no-op. */
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
    if (!save) return;
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
      source: save.source as SaveIngestEvent["source"],
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
  } catch (err) {
    log.warn("[pond events] save-ingest commit failed", err);
  }
}

export function toErrorInfo(err: unknown): ErrorInfo | null {
  if (!err) return null;
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: "Error", message: String(err) };
}

export async function commitEvent(ev: WideEvent): Promise<void> {
  try {
    const db = await getDb();
    db.insert(pipelineEvents)
      .values({
        ts: new Date(ev.ts),
        kind: ev.kind,
        saveId: "saveId" in ev ? (ev.saveId ?? null) : null,
        source: ev.source ?? null,
        op: "op" in ev ? ev.op : null,
        outcome: ev.outcome,
        durationMs: ev.durationMs ?? null,
        attempts: "attempts" in ev ? (ev.attempts ?? null) : null,
        errorName: ev.error?.name ?? null,
        errorMessage: ev.error?.message ?? null,
        trigger: "trigger" in ev ? (ev.trigger ?? null) : null,
        payload: ev,
      })
      .run();
  } catch (err) {
    // A failing event write must never break the producer. Worst case
    // we lose visibility, not data.
    log.warn("[pond events] commit failed", err);
  }
  log.info(formatSummary(ev));
}

/* One-line summary tuned for `tail -f main.log`. Designed so a
 * human reading the stream can see the same outcome the panel sees,
 * without reading 30 narration lines to assemble it. */
function formatSummary(ev: WideEvent): string {
  switch (ev.kind) {
    case "pipeline.task.completed": {
      const tag = `[task ${ev.source}/${ev.op}]`;
      const meta: string[] = [
        ev.outcome,
        `${ev.durationMs}ms`,
        `attempt ${ev.attempts}/${ev.maxAttempts}`,
        `save=${ev.saveId.slice(0, 8)}`,
      ];
      if (ev.error) meta.push(`${ev.error.name}: ${ev.error.message}`);
      if (ev.gate) meta.push(`gate=${ev.gate.reason}`);
      if (ev.nextRunAt) {
        meta.push(`nextRunAt=+${Math.round((ev.nextRunAt - ev.ts) / 1000)}s`);
      }
      return `${tag} ${meta.join(" · ")}`;
    }
    case "sync.run.completed": {
      const tag = `[sync ${ev.source}]`;
      const meta: string[] = [
        ev.outcome,
        `${Math.round(ev.durationMs / 100) / 10}s`,
        `trigger=${ev.trigger}`,
      ];
      if (ev.harvest)
        meta.push(
          `seen=${ev.harvest.seen ?? 0} fresh=${ev.harvest.fresh ?? 0}`,
        );
      if (ev.enqueue)
        meta.push(`queued=${ev.enqueue.succeeded} failed=${ev.enqueue.failed}`);
      if (ev.watchdogTripped) meta.push("watchdog");
      if (ev.error) meta.push(`${ev.error.name}: ${ev.error.message}`);
      return `${tag} ${meta.join(" · ")}`;
    }
    case "save.ingest.completed": {
      const tag = `[ingest ${ev.source}]`;
      const meta: string[] = [
        ev.outcome,
        `${Math.round(ev.durationMs / 100) / 10}s`,
        `save=${ev.saveId.slice(0, 8)}`,
        `attempts=${ev.attempts}`,
      ];
      if (ev.failedOp) meta.push(`failedAt=${ev.failedOp}`);
      if (ev.error) meta.push(`${ev.error.name}: ${ev.error.message}`);
      if (ev.fileCount) meta.push(`files=${ev.fileCount}`);
      return `${tag} ${meta.join(" · ")}`;
    }
  }
}
