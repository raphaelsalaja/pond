import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Source,
  SourceGateReason,
  SourceGateState,
} from "@pond/schema/db";
import { syncConfigFor } from "@pond/schema/sources";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "../../db";

const GateRowSchema = z.object({
  state: z.enum(["closed", "open", "half_open", "paused"]),
  reason: z.string().nullable(),
  retryAt: z.number().nullable(),
  probeLeaseToken: z.string().nullable(),
  probeLeaseExpiresAt: z.number().nullable(),
});

const LedgerRowSchema = z.object({
  requestedAt: z.number(),
  permits: z.number(),
});

export interface SourceAdmission {
  admitted: boolean;
  nextRunAt: number;
  reason: "source_budget" | "breaker_open" | "source_paused" | null;
  needsProbe: boolean;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const taskLease = new AsyncLocalStorage<string>();

export function withSourceTaskLease<T>(leaseToken: string, run: () => T): T {
  return taskLease.run(leaseToken, run);
}

export function inspectSourceAdmission(
  sqlite: Database.Database,
  source: Source,
  at: number,
  leaseToken?: string,
): SourceAdmission {
  const gate = GateRowSchema.nullable().parse(
    sqlite
      .prepare(
        `SELECT
          state,
          reason,
          retry_at AS retryAt,
          probe_lease_token AS probeLeaseToken,
          probe_lease_expires_at AS probeLeaseExpiresAt
        FROM source_gates
        WHERE source = ?`,
      )
      .get(source) ?? null,
  );
  if (gate?.state === "paused") {
    return {
      admitted: false,
      nextRunAt: Number.MAX_SAFE_INTEGER,
      reason: "source_paused",
      needsProbe: false,
    };
  }
  if (gate?.state === "open" && (gate.retryAt ?? 0) > at) {
    return {
      admitted: false,
      nextRunAt: gate.retryAt ?? at,
      reason: "breaker_open",
      needsProbe: false,
    };
  }
  if (
    gate?.state === "half_open" &&
    (gate.probeLeaseExpiresAt ?? 0) > at &&
    gate.probeLeaseToken !== leaseToken
  ) {
    return {
      admitted: false,
      nextRunAt: gate.probeLeaseExpiresAt ?? at,
      reason: "breaker_open",
      needsProbe: false,
    };
  }

  const profile = syncConfigFor(source).rate;
  const rows = z.array(LedgerRowSchema).parse(
    sqlite
      .prepare(
        `SELECT requested_at AS requestedAt, permits
        FROM source_request_ledger
        WHERE source = ? AND requested_at >= ?
        ORDER BY requested_at ASC`,
      )
      .all(source, at - DAY_MS),
  );
  let hourCount = 0;
  let dayCount = 0;
  let hourRelease = 0;
  let dayRelease = 0;
  for (const row of rows) {
    dayCount += row.permits;
    if (dayRelease === 0) dayRelease = row.requestedAt + DAY_MS;
    if (row.requestedAt >= at - HOUR_MS) {
      hourCount += row.permits;
      if (hourRelease === 0) hourRelease = row.requestedAt + HOUR_MS;
    }
  }
  const budgetRelease = Math.max(
    hourCount >= profile.maxPerHour ? hourRelease : 0,
    dayCount >= profile.maxPerDay ? dayRelease : 0,
  );
  if (budgetRelease > at) {
    return {
      admitted: false,
      nextRunAt: budgetRelease,
      reason: "source_budget",
      needsProbe: false,
    };
  }
  return {
    admitted: true,
    nextRunAt: at,
    reason: null,
    needsProbe: gate?.state === "open" || gate?.state === "half_open",
  };
}

export function claimSourceProbe(
  sqlite: Database.Database,
  source: Source,
  leaseToken: string,
  expiresAt: number,
  at: number,
): boolean {
  const result = sqlite
    .prepare(
      `INSERT INTO source_gates (
        source, state, reason, probe_lease_token, probe_lease_expires_at,
        version, updated_at
      ) VALUES (?, 'half_open', 'transient_failures', ?, ?, 1, ?)
      ON CONFLICT(source) DO UPDATE SET
        state = 'half_open',
        probe_lease_token = excluded.probe_lease_token,
        probe_lease_expires_at = excluded.probe_lease_expires_at,
        version = source_gates.version + 1,
        updated_at = excluded.updated_at
      WHERE
        source_gates.state = 'open'
        AND COALESCE(source_gates.retry_at, 0) <= ?
        OR source_gates.state = 'half_open'
        AND COALESCE(source_gates.probe_lease_expires_at, 0) <= ?`,
    )
    .run(source, leaseToken, expiresAt, at, at, at);
  return result.changes === 1;
}

export async function recordSourceRequest(
  source: Source,
  taskId?: string,
  generationId?: string | null,
): Promise<SourceAdmission> {
  const db = await getDb();
  const at = Date.now();
  return db.$raw
    .transaction(() => {
      const admission = inspectSourceAdmission(
        db.$raw,
        source,
        at,
        taskLease.getStore(),
      );
      if (!admission.admitted) return admission;
      db.$raw
        .prepare(
          `INSERT INTO source_request_ledger (
            source, requested_at, permits, task_id, generation_id
          ) VALUES (?, ?, 1, ?, ?)`,
        )
        .run(source, at, taskId ?? null, generationId ?? null);
      db.$raw
        .prepare("DELETE FROM source_request_ledger WHERE requested_at < ?")
        .run(at - DAY_MS);
      return admission;
    })
    .immediate();
}

export async function transitionSourceGate(input: {
  source: Source;
  state: SourceGateState;
  reason: SourceGateReason | null;
  retryAt: number | null;
  resetFailures?: boolean;
}): Promise<void> {
  const db = await getDb();
  const at = Date.now();
  db.$raw
    .prepare(
      `INSERT INTO source_gates (
        source, state, reason, retry_at, failure_count,
        failure_window_started_at, version, updated_at
      ) VALUES (?, ?, ?, ?, 0, NULL, 1, ?)
      ON CONFLICT(source) DO UPDATE SET
        state = excluded.state,
        reason = excluded.reason,
        retry_at = excluded.retry_at,
        probe_lease_token = NULL,
        probe_lease_expires_at = NULL,
        failure_count = CASE WHEN ? THEN 0 ELSE source_gates.failure_count END,
        failure_window_started_at = CASE
          WHEN ? THEN NULL
          ELSE source_gates.failure_window_started_at
        END,
        version = source_gates.version + 1,
        updated_at = excluded.updated_at`,
    )
    .run(
      input.source,
      input.state,
      input.reason,
      input.retryAt,
      at,
      input.resetFailures ? 1 : 0,
      input.resetFailures ? 1 : 0,
    );
}

export async function noteDurableSourceFailure(
  source: Source,
  input: {
    threshold: number;
    windowMs: number;
    openMs: number;
  },
): Promise<void> {
  const db = await getDb();
  const at = Date.now();
  db.$raw
    .transaction(() => {
      const row = z
        .object({
          failureCount: z.number(),
          failureWindowStartedAt: z.number().nullable(),
        })
        .nullable()
        .parse(
          db.$raw
            .prepare(
              `SELECT
                failure_count AS failureCount,
                failure_window_started_at AS failureWindowStartedAt
              FROM source_gates
              WHERE source = ?`,
            )
            .get(source) ?? null,
        );
      const inWindow =
        row?.failureWindowStartedAt != null &&
        at - row.failureWindowStartedAt <= input.windowMs;
      const count = inWindow ? row.failureCount + 1 : 1;
      const startedAt = inWindow ? row.failureWindowStartedAt : at;
      const shouldOpen = count >= input.threshold;
      db.$raw
        .prepare(
          `INSERT INTO source_gates (
            source, state, reason, retry_at, failure_count,
            failure_window_started_at, version, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(source) DO UPDATE SET
            state = excluded.state,
            reason = excluded.reason,
            retry_at = excluded.retry_at,
            failure_count = excluded.failure_count,
            failure_window_started_at = excluded.failure_window_started_at,
            probe_lease_token = NULL,
            probe_lease_expires_at = NULL,
            version = source_gates.version + 1,
            updated_at = excluded.updated_at`,
        )
        .run(
          source,
          shouldOpen ? "open" : "closed",
          shouldOpen ? "transient_failures" : null,
          shouldOpen ? at + input.openMs : null,
          shouldOpen ? 0 : count,
          shouldOpen ? null : startedAt,
          at,
        );
    })
    .immediate();
}
