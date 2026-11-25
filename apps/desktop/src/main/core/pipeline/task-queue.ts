import { OPS, queueGenerations, SOURCES, saves, tasks } from "@pond/schema/db";
import type { NewTask } from "@pond/schema/db";
import type Database from "better-sqlite3";
import { and, eq, inArray, isNull, ne, notExists, or } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { z } from "zod";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import { isInteractiveTask, TaskPayloadSchema } from "./priority";
import { POLL_INTERVAL_MS } from "./reconciler-config";
import type { DueTask } from "./reconciler-config";
import { claimSourceProbe, inspectSourceAdmission } from "./source-admission";
import { isSourceTask } from "./source-tasks";
import { maxAttemptsFor, planOps } from "./specs";
import { createWebHostSlots, webHostFor } from "./web-host-slots";
import type { WebHostTask } from "./web-host-slots";

const ClaimCandidateSchema = z.object({
  id: z.string(),
  saveId: z.string(),
  source: z.enum(SOURCES),
  op: z.enum(OPS),
  payload: z.string().nullable(),
  cancellationFence: z.number(),
  generationId: z.string().nullable(),
  saveSource: z.enum(SOURCES),
  url: z.string(),
});

const RunningHostTaskSchema = z.object({
  saveSource: z.enum(SOURCES),
  op: z.enum(OPS),
  url: z.string(),
});

const CLAIM_CANDIDATE_LIMIT = 500;
export const TASK_LEASE_MS = 20 * 60_000;

export interface ClaimDueTasksOptions {
  owner: string;
  limit: number;
  availableByOp: Readonly<Partial<Record<DueTask["op"], number>>>;
  availableInteractive: number;
  availableBackground: number;
}

export async function claimDueTasks(
  options: ClaimDueTasksOptions,
): Promise<Array<DueTask>> {
  const db = await getDb();
  const at = Date.now();
  const leaseExpiresAt = at + TASK_LEASE_MS;
  const claimedIds = db.$raw
    .transaction(() => {
      recoverExpiredLeasesSync(db.$raw, at);
      const candidates = z.array(ClaimCandidateSchema).parse(
        db.$raw
          .prepare(
            `SELECT
              tasks.id,
              tasks.save_id AS saveId,
              tasks.source,
              tasks.op,
              tasks.payload,
              tasks.cancellation_fence AS cancellationFence,
              tasks.generation_id AS generationId,
              saves.source AS saveSource,
              saves.url AS url
            FROM tasks
            INNER JOIN saves ON saves.id = tasks.save_id
            LEFT JOIN queue_generations
              ON queue_generations.id = tasks.generation_id
            WHERE
              tasks.status IN ('pending', 'deferred')
              AND tasks.next_run_at <= ?
              AND (
                saves.status = 'ingesting'
                OR (
                  saves.status = 'failed'
                  AND queue_generations.kind = 'retry'
                  AND queue_generations.status = 'active'
                )
              )
              AND saves.deleted_at IS NULL
              AND (
                tasks.generation_id IS NULL
                OR queue_generations.status = 'active'
              )
              AND NOT EXISTS (
                SELECT 1 FROM tasks AS peers
                WHERE peers.save_id = tasks.save_id
                  AND peers.status NOT IN ('done', 'cancelled')
                  AND CASE peers.op
                    WHEN 'harvest_metadata' THEN 0
                    WHEN 'capture_tweet' THEN 1
                    WHEN 'render_text_cover' THEN 2
                    WHEN 'fetch_blobs' THEN 3
                    WHEN 'archive_page' THEN 4
                    WHEN 'fetch_video_ytdlp' THEN 5
                    WHEN 'ensure_poster' THEN 6
                    WHEN 'fetch_avatar' THEN 7
                    WHEN 'finalize' THEN 8
                  END < CASE tasks.op
                    WHEN 'harvest_metadata' THEN 0
                    WHEN 'capture_tweet' THEN 1
                    WHEN 'render_text_cover' THEN 2
                    WHEN 'fetch_blobs' THEN 3
                    WHEN 'archive_page' THEN 4
                    WHEN 'fetch_video_ytdlp' THEN 5
                    WHEN 'ensure_poster' THEN 6
                    WHEN 'fetch_avatar' THEN 7
                    WHEN 'finalize' THEN 8
                  END
              )
            ORDER BY
              CASE json_extract(tasks.payload, '$.priority')
                WHEN 'interactive' THEN 0
                ELSE 1
              END,
              /* Never-attempted work first: retry backoff would otherwise let a
                 few repeatedly failing tasks win every claim and starve the
                 rest of the queue. */
              tasks.attempts ASC,
              tasks.next_run_at ASC,
              tasks.created_at ASC
            LIMIT ?`,
          )
          .all(at, CLAIM_CANDIDATE_LIMIT),
      );
      const ordered = fairCandidates(candidates);
      const hostSlots = createWebHostSlots(runningWebHostTasks(db.$raw));
      const available = { ...options.availableByOp };
      const claimed: Array<string> = [];
      let claimedInteractive = 0;
      let claimedBackground = 0;
      for (const candidate of ordered) {
        if (claimed.length >= options.limit) break;
        const interactive = isCandidateInteractive(candidate);
        if (
          interactive
            ? claimedInteractive >= options.availableInteractive
            : claimedBackground >= options.availableBackground
        ) {
          continue;
        }
        const op = candidate.op;
        const room = available[op] ?? 0;
        if (room <= 0) continue;
        if (!hostSlots.admits(candidate)) {
          /* Moving it a poll later lets other sites' work into the next
             candidate window instead of re-reading this host's backlog. */
          db.$raw
            .prepare(
              `UPDATE tasks
              SET
                status = 'deferred',
                deferred_reason = 'worker_capacity',
                next_run_at = ?,
                updated_at = ?
              WHERE id = ? AND status IN ('pending', 'deferred')`,
            )
            .run(at + POLL_INTERVAL_MS, at, candidate.id);
          continue;
        }
        const leaseToken = ulid();
        if (isSourceTask(op)) {
          const admission = inspectSourceAdmission(
            db.$raw,
            candidate.source,
            at,
          );
          if (!admission.admitted) {
            db.$raw
              .prepare(
                `UPDATE tasks
                SET
                  status = 'deferred',
                  deferred_reason = ?,
                  next_run_at = ?,
                  updated_at = ?
                WHERE id = ? AND status IN ('pending', 'deferred')`,
              )
              .run(admission.reason, admission.nextRunAt, at, candidate.id);
            continue;
          }
        }
        const result = db.$raw
          .prepare(
            `UPDATE tasks
            SET
              status = 'running',
              deferred_reason = NULL,
              lease_owner = ?,
              lease_token = ?,
              lease_expires_at = ?,
              heartbeat_at = ?,
              started_at = ?,
              updated_at = ?
            WHERE
              id = ?
              AND status IN ('pending', 'deferred')
              AND next_run_at <= ?
              AND cancellation_fence = ?`,
          )
          .run(
            options.owner,
            leaseToken,
            leaseExpiresAt,
            at,
            at,
            at,
            candidate.id,
            at,
            candidate.cancellationFence,
          );
        if (result.changes !== 1) continue;
        if (isSourceTask(op)) {
          const admission = inspectSourceAdmission(
            db.$raw,
            candidate.source,
            at,
          );
          if (
            admission.needsProbe &&
            !claimSourceProbe(
              db.$raw,
              candidate.source,
              leaseToken,
              leaseExpiresAt,
              at,
            )
          ) {
            db.$raw
              .prepare(
                `UPDATE tasks
                SET
                  status = 'deferred',
                  deferred_reason = 'breaker_open',
                  lease_owner = NULL,
                  lease_token = NULL,
                  lease_expires_at = NULL,
                  heartbeat_at = NULL,
                  started_at = NULL,
                  next_run_at = ?,
                  updated_at = ?
                WHERE id = ? AND lease_token = ?`,
              )
              .run(leaseExpiresAt, at, candidate.id, leaseToken);
            continue;
          }
        }
        available[op] = room - 1;
        hostSlots.occupy(candidate);
        if (interactive) claimedInteractive += 1;
        else claimedBackground += 1;
        if (candidate.generationId) {
          db.$raw
            .prepare(
              `UPDATE saves
              SET
                status = 'ingesting',
                ingest_started_at = COALESCE(ingest_started_at, ?),
                ingest_completed_at = NULL
              WHERE id = ? AND status = 'failed'`,
            )
            .run(at, candidate.saveId);
        }
        claimed.push(candidate.id);
      }
      return claimed;
    })
    .immediate();

  if (claimedIds.length === 0) return [];
  const rows = db
    .select()
    .from(tasks)
    .where(inArray(tasks.id, claimedIds))
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return claimedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;

function runningWebHostTasks(sqlite: Database.Database): Array<WebHostTask> {
  return z.array(RunningHostTaskSchema).parse(
    sqlite
      .prepare(
        `SELECT
          saves.source AS saveSource,
          tasks.op,
          saves.url AS url
        FROM tasks
        INNER JOIN saves ON saves.id = tasks.save_id
        WHERE tasks.status = 'running' AND saves.source = 'web'`,
      )
      .all(),
  );
}

const HostWaiterSchema = RunningHostTaskSchema.extend({ id: z.string() });
/** Bounds the scan for the next waiter; a deeper backlog waits for the regular poll. */
const HOST_WAITER_SCAN = 500;

/**
 * A claim defers work for a full host one poll later, so a slot that frees mid-poll would
 * sit idle until then. When host-limited web work settles, the oldest task waiting on that
 * host becomes due now; one per freed slot, so the cap per host still holds.
 */
export async function releaseWebHostWaiter(
  finished: Pick<DueTask, "saveId" | "op">,
  at = Date.now(),
): Promise<boolean> {
  const { $raw } = await getDb();
  const save = z
    .object({ saveSource: z.enum(SOURCES), url: z.string() })
    .optional()
    .parse(
      $raw
        .prepare("SELECT source AS saveSource, url FROM saves WHERE id = ?")
        .get(finished.saveId),
    );
  if (!save) return false;
  const host = webHostFor({ ...save, op: finished.op });
  if (!host) return false;
  const waiters = z.array(HostWaiterSchema).parse(
    $raw
      .prepare(
        `SELECT tasks.id, tasks.op, saves.source AS saveSource, saves.url AS url
        FROM tasks
        INNER JOIN saves ON saves.id = tasks.save_id
        WHERE tasks.status = 'deferred'
          AND tasks.deferred_reason = 'worker_capacity'
          AND saves.source = 'web'
        ORDER BY tasks.next_run_at ASC, tasks.created_at ASC
        LIMIT ?`,
      )
      .all(HOST_WAITER_SCAN),
  );
  const next = waiters.find((waiter) => webHostFor(waiter) === host);
  if (!next) return false;
  const result = $raw
    .prepare(
      `UPDATE tasks SET next_run_at = ?, updated_at = ?
      WHERE id = ? AND status = 'deferred' AND deferred_reason = 'worker_capacity'`,
    )
    .run(at, at, next.id);
  return result.changes === 1;
}

function fairCandidates(
  candidates: ReadonlyArray<ClaimCandidate>,
): Array<ClaimCandidate> {
  const interactive: Array<ClaimCandidate> = [];
  const background: Array<ClaimCandidate> = [];
  for (const candidate of candidates) {
    if (isCandidateInteractive(candidate)) interactive.push(candidate);
    else background.push(candidate);
  }
  return [...roundRobinLanes(interactive), ...roundRobinLanes(background)];
}

function roundRobinLanes(
  candidates: ReadonlyArray<ClaimCandidate>,
): Array<ClaimCandidate> {
  const lanes = new Map<string, Array<ClaimCandidate>>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.op}`;
    const lane = lanes.get(key);
    if (lane) lane.push(candidate);
    else lanes.set(key, [candidate]);
  }
  const ordered: Array<ClaimCandidate> = [];
  let found = true;
  while (found) {
    found = false;
    for (const lane of lanes.values()) {
      const candidate = lane.shift();
      if (!candidate) continue;
      ordered.push(candidate);
      found = true;
    }
  }
  return ordered;
}

function isCandidateInteractive(candidate: ClaimCandidate): boolean {
  if (!candidate.payload) return false;
  try {
    return (
      TaskPayloadSchema.parse(JSON.parse(candidate.payload)).priority ===
      "interactive"
    );
  } catch {
    return false;
  }
}

export function recoverExpiredLeasesSync(
  sqlite: Database.Database,
  at: number,
): number {
  return sqlite
    .prepare(
      `UPDATE tasks
      SET
        status = 'pending',
        deferred_reason = NULL,
        lease_owner = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        heartbeat_at = NULL,
        started_at = NULL,
        next_run_at = ?,
        last_error = 'recovered: task lease expired',
        updated_at = ?
      WHERE
        status = 'running'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?`,
    )
    .run(at, at, at).changes;
}

export async function recoverExpiredLeases(): Promise<number> {
  const db = await getDb();
  const recovered = db.$raw
    .transaction(() => recoverExpiredLeasesSync(db.$raw, Date.now()))
    .immediate();
  if (recovered > 0) {
    log.info("[pond pipeline:reconciler] recovered expired leases", {
      count: recovered,
    });
  }
  return recovered;
}

export function extendOwnedLeasesSync(
  sqlite: Database.Database,
  owner: string,
  at: number,
  heartbeat: boolean,
): number {
  return sqlite
    .prepare(
      `UPDATE tasks
      SET
        lease_expires_at = ?,
        heartbeat_at = CASE WHEN ? THEN ? ELSE heartbeat_at END,
        updated_at = ?
      WHERE status = 'running' AND lease_owner = ?`,
    )
    .run(at + TASK_LEASE_MS, heartbeat ? 1 : 0, at, at, owner).changes;
}

export async function heartbeatTaskLease(task: DueTask): Promise<boolean> {
  if (!task.leaseToken) return false;
  const db = await getDb();
  const at = Date.now();
  const result = db.$raw
    .prepare(
      `UPDATE tasks
      SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
      WHERE
        id = ?
        AND status = 'running'
        AND lease_token = ?
        AND cancellation_fence = ?`,
    )
    .run(
      at,
      at + TASK_LEASE_MS,
      at,
      task.id,
      task.leaseToken,
      task.cancellationFence,
    );
  return result.changes === 1;
}

const LeaseRowSchema = z.object({
  status: z.string(),
  cancellationFence: z.number(),
  leaseToken: z.string().nullable(),
  deletedAt: z.number().nullable(),
});

export async function ingestLeaseStillRunnable(
  task: DueTask,
): Promise<boolean> {
  if (!task.leaseToken) return false;
  const db = await getDb();
  const row = LeaseRowSchema.nullable().parse(
    db.$raw
      .prepare(
        `SELECT
          tasks.status AS status,
          tasks.cancellation_fence AS cancellationFence,
          tasks.lease_token AS leaseToken,
          saves.deleted_at AS deletedAt
        FROM tasks
        INNER JOIN saves ON saves.id = tasks.save_id
        WHERE tasks.id = ?`,
      )
      .get(task.id) ?? null,
  );
  return (
    row?.status === "running" &&
    row.leaseToken === task.leaseToken &&
    row.cancellationFence === task.cancellationFence &&
    row.deletedAt === null
  );
}

export function isDueTaskRunnable(row: DueTask, sourceUntil: number): boolean {
  return !isBlockedBySourceCooldown(row, sourceUntil);
}

function isBlockedBySourceCooldown(row: DueTask, sourceUntil: number): boolean {
  return isSourceTask(row.op) && sourceUntil > 0 && !isInteractiveTask(row);
}

const DISPATCH_BATCH = 20;

export function scheduleDueTasks(rows: ReadonlyArray<DueTask>): Array<DueTask> {
  const interactive: Array<DueTask> = [];
  const background: Array<DueTask> = [];
  for (const row of rows) {
    if (isInteractiveTask(row)) interactive.push(row);
    else background.push(row);
  }
  const head = interleaveBySave(interactive, DISPATCH_BATCH);
  if (head.length >= DISPATCH_BATCH) return head;
  return [
    ...head,
    ...interleaveBySave(background, DISPATCH_BATCH - head.length),
  ];
}

function interleaveBySave(
  rows: ReadonlyArray<DueTask>,
  limit: number,
): Array<DueTask> {
  const buckets = new Map<string, Array<DueTask>>();
  for (const row of rows) {
    const bucket = buckets.get(row.saveId);
    if (bucket) bucket.push(row);
    else buckets.set(row.saveId, [row]);
  }
  const interleaved: Array<DueTask> = [];
  let progress = true;
  while (progress && interleaved.length < limit) {
    progress = false;
    for (const bucket of buckets.values()) {
      if (interleaved.length >= limit) break;
      const next = bucket.shift();
      if (!next) continue;
      interleaved.push(next);
      progress = true;
    }
  }
  return interleaved;
}

export async function sweepOrphanTasks(): Promise<void> {
  const db = await getDb();
  const orphans = db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(saves, eq(tasks.saveId, saves.id))
    .where(
      and(
        inArray(tasks.status, ["pending", "deferred"]),
        ne(saves.status, "ingesting"),
        notExists(
          db
            .select({ id: queueGenerations.id })
            .from(queueGenerations)
            .where(
              and(
                eq(saves.status, "failed"),
                eq(queueGenerations.id, tasks.generationId),
                eq(queueGenerations.kind, "retry"),
                or(
                  eq(queueGenerations.status, "active"),
                  eq(queueGenerations.status, "paused"),
                ),
              ),
            ),
        ),
      ),
    )
    .all();
  if (orphans.length === 0) return;
  db.update(tasks)
    .set({
      status: "dead",
      lastError: "orphan: save no longer ingesting",
      failedAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      inArray(
        tasks.id,
        orphans.map((o) => o.id),
      ),
    )
    .run();
  log.info("[pond pipeline:reconciler] swept orphan tasks", {
    count: orphans.length,
  });
}

export async function sweepTasklessIngestingSaves(): Promise<void> {
  const db = await getDb();
  const stuck = db
    .select({ id: saves.id, source: saves.source })
    .from(saves)
    .where(
      and(
        eq(saves.status, "ingesting"),
        isNull(saves.deletedAt),
        notExists(
          db
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.saveId, saves.id)),
        ),
      ),
    )
    .all();
  if (stuck.length === 0) return;

  const now = new Date();
  for (const { id, source } of stuck) {
    const ops = planOps(source);
    if (ops.length === 0) {
      await persistSave(
        id,
        { status: "complete", ingestCompletedAt: now },
        { actorReason: "pipeline:sweep-taskless" },
      );
      continue;
    }
    const taskRows: Array<NewTask> = ops.map((op) => ({
      id: ulid(),
      saveId: id,
      source,
      op,
      status: "pending",
      attempts: 0,
      maxAttempts: maxAttemptsFor(op),
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    db.insert(tasks).values(taskRows).run();
  }
  log.info("[pond pipeline:reconciler] re-seeded taskless ingesting saves", {
    count: stuck.length,
  });
}
