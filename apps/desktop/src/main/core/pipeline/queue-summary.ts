import { QueueSummarySchema } from "@shared/queue-contracts";
import type { QueueSummary } from "@shared/queue-contracts";
import type Database from "better-sqlite3";
import { getDb } from "../../db";

export async function readQueueSummary(): Promise<QueueSummary> {
  return queryQueueSummary((await getDb()).$raw);
}

export function queryQueueSummary(sqlite: Database.Database): QueueSummary {
  return QueueSummarySchema.parse(
    sqlite
      .prepare(
        `SELECT
          COALESCE(SUM(status = 'running'), 0) AS running,
          COALESCE(SUM(
            status = 'pending'
            OR status = 'deferred'
              AND deferred_reason IN ('retry_backoff', 'worker_capacity')
          ), 0) AS waiting,
          COALESCE(SUM(
            status = 'deferred'
            AND deferred_reason NOT IN ('retry_backoff', 'worker_capacity')
          ), 0) AS parked,
          COALESCE(SUM(status = 'blocked'), 0) AS failed,
          COALESCE(SUM(status = 'cancelled'), 0) AS cancelled,
          COALESCE(SUM(status = 'dead'), 0) AS dead,
          (
            SELECT COUNT(DISTINCT t.save_id)
            FROM tasks t
            JOIN saves s ON s.id = t.save_id
            WHERE t.status IN ('pending', 'deferred', 'running', 'blocked', 'dead')
              AND s.status != 'complete'
              AND s.deleted_at IS NULL
          ) AS actionable
        FROM tasks`,
      )
      .get(),
  );
}
