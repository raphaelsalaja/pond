import type Database from "better-sqlite3";
import { z } from "zod";
import { abortRunningIngest } from "./running-ingest";

/**
 * Marks tasks stopped because the save moved to Trash.
 * Undo looks for this exact reason and no other cancellation.
 */
const TRASHED_INGEST_REASON = "cancelled: save moved to trash";

const OPEN_TASK_STATUSES = "('pending', 'deferred', 'running', 'blocked')";

const TaskIdSchema = z.object({
  id: z.string(),
  status: z.string(),
  generationId: z.string().nullable(),
});

export interface ReleasedIngest {
  cancelled: number;
  generationIds: string[];
}

function scopeArgs(saveIds: readonly string[] | null): [number, string] {
  return [saveIds == null ? 0 : 1, JSON.stringify(saveIds ?? [])];
}

export function releaseTrashedIngestSync(
  sqlite: Database.Database,
  saveIds: readonly string[] | null,
  at: number,
): ReleasedIngest {
  const [scoped, ids] = scopeArgs(saveIds);
  const open = z.array(TaskIdSchema).parse(
    sqlite
      .prepare(
        `SELECT
          tasks.id AS id,
          tasks.status AS status,
          tasks.generation_id AS generationId
        FROM tasks
        INNER JOIN saves ON saves.id = tasks.save_id
        WHERE
          tasks.status IN ${OPEN_TASK_STATUSES}
          AND saves.deleted_at IS NOT NULL
          AND (? = 0 OR tasks.save_id IN (SELECT value FROM json_each(?)))`,
      )
      .all(scoped, ids),
  );
  for (const task of open) {
    if (task.status === "running") abortRunningIngest(task.id);
  }
  const cancelled = sqlite
    .prepare(
      `UPDATE tasks
      SET
        status = 'cancelled',
        last_error = ?,
        cancellation_fence = cancellation_fence + 1,
        lease_owner = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        heartbeat_at = NULL,
        started_at = NULL,
        failed_at = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE
        status IN ${OPEN_TASK_STATUSES}
        AND save_id IN (
          SELECT id FROM saves
          WHERE
            deleted_at IS NOT NULL
            AND (? = 0 OR id IN (SELECT value FROM json_each(?)))
        )`,
    )
    .run(TRASHED_INGEST_REASON, at, at, scoped, ids).changes;
  for (const task of open) abortRunningIngest(task.id);
  return {
    cancelled,
    generationIds: [
      ...new Set(
        open.flatMap((task) => (task.generationId ? [task.generationId] : [])),
      ),
    ],
  };
}

export function resumeTrashedIngestSync(
  sqlite: Database.Database,
  saveIds: readonly string[],
  at: number,
): number {
  if (saveIds.length === 0) return 0;
  return sqlite
    .prepare(
      `UPDATE tasks
      SET
        status = 'pending',
        attempts = 0,
        -- A finished batch stays done. Tasks left on it would never be claimed again.
        generation_id = CASE
          WHEN generation_id IS NULL THEN NULL
          WHEN EXISTS (
            SELECT 1 FROM queue_generations
            WHERE
              queue_generations.id = tasks.generation_id
              AND queue_generations.status IN ('active', 'paused')
          ) THEN generation_id
          ELSE NULL
        END,
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
        status = 'cancelled'
        AND last_error = ?
        AND save_id IN (SELECT value FROM json_each(?))
        AND EXISTS (
          SELECT 1 FROM saves
          WHERE saves.id = tasks.save_id AND saves.deleted_at IS NULL
        )`,
    )
    .run(at, at, TRASHED_INGEST_REASON, JSON.stringify(saveIds)).changes;
}
