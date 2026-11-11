import {
  CANCEL_REASON,
  type QueueGenerationKind,
  type QueueGenerationStatus,
  SOURCES,
  type Source,
} from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import { ulid } from "ulid";
import { z } from "zod";
import { getDb } from "../../db";
import { liftAuthStopSync } from "./source-admission";

const RetryCandidateSchema = z.object({
  id: z.string(),
  source: z.enum(SOURCES),
});

const GenerationRowSchema = z.object({
  id: z.string(),
  kind: z.enum(["retry", "sync", "refresh"]),
  status: z.enum(["active", "paused", "cancelling", "cancelled", "done"]),
  source: z.enum(SOURCES).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().nullable(),
});

const GenerationCountSchema = z.object({
  status: z.enum([
    "pending",
    "deferred",
    "running",
    "done",
    "blocked",
    "dead",
    "cancelled",
  ]),
  count: z.number(),
});

export interface QueueGenerationProgress {
  id: string;
  kind: QueueGenerationKind;
  status: QueueGenerationStatus;
  source: Source | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  total: number;
  pending: number;
  deferred: number;
  running: number;
  done: number;
  blocked: number;
  dead: number;
  cancelled: number;
}

export interface RetryGenerationResult {
  generationId: string | null;
  queued: number;
  sources: Partial<Record<Source, number>>;
}

export async function createRetryGeneration(
  ids?: readonly string[],
  { liftAuthStop = true }: { liftAuthStop?: boolean } = {},
): Promise<RetryGenerationResult> {
  const db = await getDb();
  const at = Date.now();
  const generationId = ulid();
  return db.$raw
    .transaction(() => {
      const scoped = ids != null && ids.length > 0;
      const rows = z.array(RetryCandidateSchema).parse(
        db.$raw
          .prepare(
            `SELECT DISTINCT saves.id, saves.source
            FROM saves
            WHERE
              saves.status IN ('failed', 'ingesting')
              AND saves.deleted_at IS NULL
              AND (? = 0 OR saves.id IN (SELECT value FROM json_each(?)))
              AND EXISTS (
                SELECT 1 FROM tasks
                WHERE
                  tasks.save_id = saves.id
                  AND tasks.status IN ('dead', 'blocked')
                  AND COALESCE(tasks.last_error, '') != ?
              )
            ORDER BY saves.saved_at DESC`,
          )
          .all(scoped ? 1 : 0, JSON.stringify(ids ?? []), CANCEL_REASON),
      );
      if (rows.length === 0) {
        return { generationId: null, queued: 0, sources: {} };
      }
      const sources: Partial<Record<Source, number>> = {};
      for (const row of rows) {
        sources[row.source] = (sources[row.source] ?? 0) + 1;
      }
      db.$raw
        .prepare(
          `INSERT INTO queue_generations (
            id, kind, status, scope, cancellation_fence, created_at, updated_at
          ) VALUES (?, 'retry', 'active', ?, 0, ?, ?)`,
        )
        .run(
          generationId,
          JSON.stringify({
            saveIds: rows.map((row) => row.id),
            sources,
          }),
          at,
          at,
        );
      const retry = db.$raw.prepare(
        `UPDATE tasks
        SET
          status = 'pending',
          attempts = 0,
          generation_id = ?,
          cancellation_fence = cancellation_fence + 1,
          deferred_reason = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          heartbeat_at = NULL,
          started_at = NULL,
          failed_at = NULL,
          completed_at = NULL,
          last_error = NULL,
          next_run_at = ?,
          updated_at = ?
        WHERE
          save_id = ?
          AND status IN ('dead', 'blocked', 'pending', 'deferred')
          AND COALESCE(last_error, '') != ?`,
      );
      for (const row of rows) {
        retry.run(generationId, at, at, row.id, CANCEL_REASON);
      }
      if (liftAuthStop) {
        for (const source of new Set(rows.map((row) => row.source))) {
          liftAuthStopSync(db.$raw, source, at);
        }
      }
      return { generationId, queued: rows.length, sources };
    })
    .immediate();
}

export async function createQueueGeneration(input: {
  kind: Exclude<QueueGenerationKind, "retry">;
  source?: Source;
  scope?: Record<string, JsonValue>;
}): Promise<string> {
  const db = await getDb();
  const id = ulid();
  const at = Date.now();
  db.$raw
    .prepare(
      `INSERT INTO queue_generations (
        id, kind, status, source, scope, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.kind,
      input.source ?? null,
      input.scope ? JSON.stringify(input.scope) : null,
      at,
      at,
    );
  return id;
}

export async function setQueueGenerationPaused(
  generationId: string,
  paused: boolean,
): Promise<boolean> {
  const db = await getDb();
  const at = Date.now();
  const result = db.$raw
    .prepare(
      `UPDATE queue_generations
      SET status = ?, updated_at = ?
      WHERE id = ? AND status IN ('active', 'paused')`,
    )
    .run(paused ? "paused" : "active", at, generationId);
  if (!paused && result.changes === 1) {
    db.$raw
      .prepare(
        `UPDATE tasks
        SET
          status = 'pending',
          deferred_reason = NULL,
          next_run_at = ?,
          updated_at = ?
        WHERE
          generation_id = ?
          AND status = 'deferred'
          AND deferred_reason = 'queue_paused'`,
      )
      .run(at, at, generationId);
  }
  return result.changes === 1;
}

export async function cancelQueueGeneration(
  generationId: string,
): Promise<string[]> {
  const db = await getDb();
  const at = Date.now();
  return db.$raw
    .transaction(() => {
      const running = z.array(z.object({ id: z.string() })).parse(
        db.$raw
          .prepare(
            `SELECT id FROM tasks
            WHERE generation_id = ? AND status = 'running'`,
          )
          .all(generationId),
      );
      const generation = db.$raw
        .prepare(
          `UPDATE queue_generations
          SET
            status = 'cancelled',
            cancellation_fence = cancellation_fence + 1,
            completed_at = ?,
            updated_at = ?
          WHERE id = ? AND status IN ('active', 'paused', 'cancelling')`,
        )
        .run(at, at, generationId);
      if (generation.changes !== 1) return [];
      db.$raw
        .prepare(
          `UPDATE tasks
          SET
            status = 'cancelled',
            cancellation_fence = cancellation_fence + 1,
            lease_owner = NULL,
            lease_token = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            completed_at = ?,
            last_error = ?,
            updated_at = ?
          WHERE
            generation_id = ?
            AND status IN ('pending', 'deferred', 'running', 'blocked')`,
        )
        .run(at, CANCEL_REASON, at, generationId);
      db.$raw
        .prepare(
          `UPDATE saves
          SET status = 'failed'
          WHERE
            id IN (
              SELECT DISTINCT save_id FROM tasks WHERE generation_id = ?
            )
            AND status = 'ingesting'
            AND NOT EXISTS (
              SELECT 1 FROM tasks AS active
              WHERE
                active.save_id = saves.id
                AND active.generation_id IS NOT ?
                AND active.status IN ('pending', 'deferred', 'running', 'blocked')
            )`,
        )
        .run(generationId, generationId);
      return running.map((row) => row.id);
    })
    .immediate();
}

export async function completeQueueGenerationIfSettled(
  generationId: string | null,
): Promise<void> {
  if (!generationId) return;
  const db = await getDb();
  const at = Date.now();
  db.$raw
    .prepare(
      `UPDATE queue_generations
      SET status = 'done', completed_at = ?, updated_at = ?
      WHERE
        id = ?
        AND status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM tasks
          WHERE
            generation_id = queue_generations.id
            AND status IN ('pending', 'deferred', 'running', 'blocked')
        )`,
    )
    .run(at, at, generationId);
}

export async function listQueueGenerations(): Promise<
  QueueGenerationProgress[]
> {
  const db = await getDb();
  const rows = z.array(GenerationRowSchema).parse(
    db.$raw
      .prepare(
        `SELECT
          id,
          kind,
          status,
          source,
          created_at AS createdAt,
          updated_at AS updatedAt,
          completed_at AS completedAt
        FROM queue_generations
        ORDER BY created_at DESC`,
      )
      .all(),
  );
  const counts = db.$raw.prepare(
    `SELECT status, COUNT(*) AS count
    FROM tasks
    WHERE generation_id = ?
    GROUP BY status`,
  );
  return rows.map((row) => {
    const values = {
      pending: 0,
      deferred: 0,
      running: 0,
      done: 0,
      blocked: 0,
      dead: 0,
      cancelled: 0,
    };
    for (const count of z
      .array(GenerationCountSchema)
      .parse(counts.all(row.id))) {
      values[count.status] = count.count;
    }
    return {
      ...row,
      ...values,
      total: Object.values(values).reduce((sum, count) => sum + count, 0),
    };
  });
}
