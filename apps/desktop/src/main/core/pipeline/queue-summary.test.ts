import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migratePond } from "../../database/migrations";
import { queryQueueSummary } from "./queue-summary";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("queryQueueSummary", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    migratePond(sqlite);
  });

  afterEach(() => sqlite.close());

  function seed(
    id: string,
    saveStatus: string,
    taskStatus: string,
    deletedAt: number | null = null,
  ) {
    sqlite
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status, deleted_at)
        VALUES (?, 'twitter', ?, ?, ?, ?)`,
      )
      .run(id, id, `https://x.com/a/status/${id}`, saveStatus, deletedAt);
    sqlite
      .prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, attempts, max_attempts,
          next_run_at, created_at, updated_at
        ) VALUES (?, ?, 'twitter', 'harvest_metadata', ?, 0, 5, 0, 0, 0)`,
      )
      .run(`task-${id}`, id, taskStatus);
  }

  it("leaves completed and trashed saves out of the actionable count", () => {
    seed("ingesting", "ingesting", "pending");
    seed("failed", "failed", "dead");
    seed("complete", "complete", "deferred");
    seed("trashed", "failed", "blocked", 1);

    expect(queryQueueSummary(sqlite).actionable).toBe(2);
  });
});
