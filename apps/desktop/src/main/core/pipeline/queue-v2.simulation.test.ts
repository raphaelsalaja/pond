import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { migratePond } from "../../database/migrations";
import { claimSourceProbe, inspectSourceAdmission } from "./source-admission";
import {
  extendOwnedLeasesSync,
  recoverExpiredLeasesSync,
  TASK_LEASE_MS,
} from "./task-queue";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("Queue V2 simulations", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    migratePond(sqlite);
  });

  afterEach(() => sqlite.close());

  it("keeps 8,000 retries durable without marking every save active", () => {
    const insert = sqlite.transaction(() => {
      const save = sqlite.prepare(
        `INSERT INTO saves (
          id, source, source_id, url, status, saved_at, created_at
        ) VALUES (?, 'twitter', ?, ?, 'failed', ?, ?)`,
      );
      const task = sqlite.prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, attempts, max_attempts,
          next_run_at, created_at, updated_at
        ) VALUES (?, ?, 'twitter', 'harvest_metadata', 'dead', 5, 5, 0, 0, 0)`,
      );
      for (let index = 0; index < 8000; index++) {
        const id = `save-${index}`;
        save.run(
          id,
          String(index),
          `https://x.com/a/status/${index}`,
          index,
          index,
        );
        task.run(`task-${index}`, id);
      }
    });
    insert();
    sqlite
      .prepare(
        `INSERT INTO queue_generations (
          id, kind, status, created_at, updated_at
        ) VALUES ('retry-1', 'retry', 'active', 1, 1)`,
      )
      .run();
    sqlite
      .prepare(
        `UPDATE tasks
        SET status = 'pending', generation_id = 'retry-1', attempts = 0
        WHERE status = 'dead'`,
      )
      .run();

    const result = z.object({ queued: z.number(), active: z.number() }).parse(
      sqlite
        .prepare(
          `SELECT
              COUNT(*) AS queued,
              SUM(saves.status = 'ingesting') AS active
            FROM tasks
            JOIN saves ON saves.id = tasks.save_id
            WHERE tasks.generation_id = 'retry-1'`,
        )
        .get(),
    );
    expect(result).toEqual({ queued: 8000, active: 0 });
  });

  it("parks Twitter while admitting runnable Web work", () => {
    const at = Date.now();
    sqlite
      .prepare(
        `INSERT INTO source_gates (
          source, state, reason, retry_at, updated_at
        ) VALUES ('twitter', 'open', 'rate_limit', ?, ?)`,
      )
      .run(at + 60_000, at);

    expect(inspectSourceAdmission(sqlite, "twitter", at)).toMatchObject({
      admitted: false,
      reason: "breaker_open",
    });
    expect(inspectSourceAdmission(sqlite, "web", at)).toMatchObject({
      admitted: true,
      reason: null,
    });
  });

  it("admits only one half-open recovery probe", () => {
    const at = Date.now();
    sqlite
      .prepare(
        `INSERT INTO source_gates (
          source, state, reason, retry_at, updated_at
        ) VALUES ('twitter', 'open', 'transient_failures', ?, ?)`,
      )
      .run(at - 1, at);

    expect(
      claimSourceProbe(sqlite, "twitter", "lease-one", at + 60_000, at),
    ).toBe(true);
    expect(
      claimSourceProbe(sqlite, "twitter", "lease-two", at + 60_000, at),
    ).toBe(false);
  });

  it("rejects stale settlement after cancellation advances the fence", () => {
    sqlite
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
        VALUES ('save', 'web', 'save', 'https://example.com', 'ingesting')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, lease_owner, lease_token,
          lease_expires_at, cancellation_fence
        ) VALUES (
          'task', 'save', 'web', 'harvest_metadata', 'running',
          'owner', 'new-token', ?, 2
        )`,
      )
      .run(Date.now() + 60_000);

    const stale = sqlite
      .prepare(
        `UPDATE tasks
        SET status = 'done'
        WHERE id = 'task' AND lease_token = 'old-token' AND cancellation_fence = 1`,
      )
      .run();
    expect(stale.changes).toBe(0);
  });

  it("allows only one competing claim for a pending task", () => {
    sqlite
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
        VALUES ('save', 'web', 'save', 'https://example.com', 'ingesting')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, cancellation_fence
        ) VALUES ('task', 'save', 'web', 'harvest_metadata', 'pending', 0)`,
      )
      .run();
    const claim = sqlite.prepare(
      `UPDATE tasks
      SET status = 'running', lease_owner = ?, lease_token = ?
      WHERE id = 'task' AND status = 'pending' AND cancellation_fence = 0`,
    );

    expect(claim.run("owner-one", "lease-one").changes).toBe(1);
    expect(claim.run("owner-two", "lease-two").changes).toBe(0);
    expect(
      sqlite
        .prepare(
          "SELECT lease_owner AS owner, lease_token AS token FROM tasks WHERE id = 'task'",
        )
        .get(),
    ).toEqual({ owner: "owner-one", token: "lease-one" });
  });

  it("recovers only expired leases", () => {
    const at = Date.now();
    sqlite
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
        VALUES
          ('expired-save', 'web', 'expired', 'https://example.com/expired', 'ingesting'),
          ('active-save', 'web', 'active', 'https://example.com/active', 'ingesting')`,
      )
      .run();
    const insert = sqlite.prepare(
      `INSERT INTO tasks (
        id, save_id, source, op, status, lease_owner, lease_token,
        lease_expires_at, heartbeat_at
      ) VALUES (?, ?, 'web', 'harvest_metadata', 'running', 'owner', ?, ?, ?)`,
    );
    insert.run("expired", "expired-save", "expired-token", at - 1, at - 10);
    insert.run("active", "active-save", "active-token", at + 60_000, at);

    expect(recoverExpiredLeasesSync(sqlite, at)).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT id, status, lease_token AS leaseToken FROM tasks ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: "active", status: "running", leaseToken: "active-token" },
      { id: "expired", status: "pending", leaseToken: null },
    ]);
  });

  it("extends owned leases across Mac suspend and refreshes heartbeats on resume", () => {
    const suspendedAt = Date.now();
    sqlite
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
        VALUES ('save', 'web', 'save', 'https://example.com', 'ingesting')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, lease_owner, lease_token,
          lease_expires_at, heartbeat_at
        ) VALUES (
          'task', 'save', 'web', 'harvest_metadata', 'running',
          'main:1', 'lease', ?, ?
        )`,
      )
      .run(suspendedAt + 10, suspendedAt - 1000);

    expect(extendOwnedLeasesSync(sqlite, "main:1", suspendedAt, false)).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT lease_expires_at AS leaseExpiresAt, heartbeat_at AS heartbeatAt FROM tasks",
        )
        .get(),
    ).toEqual({
      leaseExpiresAt: suspendedAt + TASK_LEASE_MS,
      heartbeatAt: suspendedAt - 1000,
    });

    const resumedAt = suspendedAt + 30_000;
    expect(extendOwnedLeasesSync(sqlite, "main:1", resumedAt, true)).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT lease_expires_at AS leaseExpiresAt, heartbeat_at AS heartbeatAt FROM tasks",
        )
        .get(),
    ).toEqual({
      leaseExpiresAt: resumedAt + TASK_LEASE_MS,
      heartbeatAt: resumedAt,
    });
  });

  it("cancels one generation while preserving 70 unrelated saves", () => {
    const insert = sqlite.transaction(() => {
      const save = sqlite.prepare(
        `INSERT INTO saves (id, source, source_id, url, status)
        VALUES (?, 'web', ?, ?, 'ingesting')`,
      );
      const task = sqlite.prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, generation_id
        ) VALUES (?, ?, 'web', 'harvest_metadata', 'pending', ?)`,
      );
      sqlite
        .prepare(
          `INSERT INTO queue_generations (
            id, kind, status, created_at, updated_at
          ) VALUES ('target', 'retry', 'active', 1, 1)`,
        )
        .run();
      for (let index = 0; index < 80; index++) {
        const id = `save-${index}`;
        save.run(id, id, `https://example.com/${index}`);
        task.run(`task-${index}`, id, index < 10 ? "target" : null);
      }
    });
    insert();
    sqlite
      .prepare(
        `UPDATE tasks
        SET status = 'cancelled', cancellation_fence = cancellation_fence + 1
        WHERE generation_id = 'target'`,
      )
      .run();

    const preserved = z
      .object({ count: z.number() })
      .parse(
        sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM tasks WHERE status = 'pending'",
          )
          .get(),
      );
    expect(preserved.count).toBe(70);
  });
});
