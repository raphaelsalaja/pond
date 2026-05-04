import { type EnrichJobKind, enrichJobs, saves } from "@pond/schema/db";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../db";

/**
 * Tiny persistent queue for the enrichment worker. Each (saveId, kind)
 * pair is unique and idempotent — calling `enqueue` twice for the same
 * pair just resets the attempt clock.
 */

const ALL_KINDS: EnrichJobKind[] = ["colors", "article", "vision", "embed"];

export async function enqueue(
  saveId: string,
  kinds: EnrichJobKind[] = ALL_KINDS,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  for (const kind of kinds) {
    try {
      await db
        .insert(enrichJobs)
        .values({
          id: ulid(),
          saveId,
          kind,
          state: "pending",
          attempts: 0,
          nextAttemptAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [enrichJobs.saveId, enrichJobs.kind],
          set: {
            state: "pending",
            nextAttemptAt: now,
            lastError: null,
            updatedAt: now,
          },
        })
        .run();
    } catch (err) {
      log.warn("[pond enrich/queue] enqueue failed", saveId, kind, err);
    }
  }
}

/** Mark the queue item as `running` so concurrent workers don't pick it up. */
export async function claimNext(): Promise<{
  id: string;
  saveId: string;
  kind: EnrichJobKind;
  attempts: number;
} | null> {
  const db = await getDb();
  const raw = db.$raw;
  const now = Date.now();
  // Atomic claim using an UPDATE...RETURNING. better-sqlite3 supports
  // it as long as we run the prepare + bind inline. Skip rows that
  // another worker is already running.
  const row = raw
    .prepare(
      `UPDATE enrich_jobs
       SET state = 'running', updated_at = ?
       WHERE id = (
         SELECT id FROM enrich_jobs
         WHERE state = 'pending' AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC LIMIT 1
       )
       RETURNING id, save_id, kind, attempts`,
    )
    .get(now, now) as
    | { id: string; save_id: string; kind: string; attempts: number }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    saveId: row.save_id,
    kind: row.kind as EnrichJobKind,
    attempts: row.attempts,
  };
}

export async function markDone(id: string): Promise<void> {
  const db = await getDb();
  await db
    .update(enrichJobs)
    .set({ state: "done", updatedAt: new Date(), lastError: null })
    .where(eq(enrichJobs.id, id))
    .run();
}

export async function markSkipped(id: string, reason: string): Promise<void> {
  const db = await getDb();
  await db
    .update(enrichJobs)
    .set({
      state: "skipped",
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(eq(enrichJobs.id, id))
    .run();
}

export async function markError(
  id: string,
  attempts: number,
  err: string,
): Promise<void> {
  const db = await getDb();
  // Backoff: 30s, 5m, 30m, then give up.
  const backoffs = [30_000, 5 * 60_000, 30 * 60_000];
  const next = attempts < backoffs.length ? (backoffs[attempts] ?? null) : null;
  if (next === null) {
    await db
      .update(enrichJobs)
      .set({
        state: "error",
        attempts: attempts + 1,
        lastError: err,
        updatedAt: new Date(),
      })
      .where(eq(enrichJobs.id, id))
      .run();
    return;
  }
  await db
    .update(enrichJobs)
    .set({
      state: "pending",
      attempts: attempts + 1,
      lastError: err,
      nextAttemptAt: new Date(Date.now() + next),
      updatedAt: new Date(),
    })
    .where(eq(enrichJobs.id, id))
    .run();
}

export async function status(): Promise<{
  pending: number;
  running: number;
  done: number;
  error: number;
}> {
  const db = await getDb();
  const raw = db.$raw;
  const rows = raw
    .prepare(`SELECT state, COUNT(*) as count FROM enrich_jobs GROUP BY state`)
    .all() as Array<{ state: string; count: number }>;
  const map = new Map(rows.map((r) => [r.state, r.count]));
  return {
    pending: map.get("pending") ?? 0,
    running: map.get("running") ?? 0,
    done: map.get("done") ?? 0,
    error: map.get("error") ?? 0,
  };
}

/**
 * Enqueue any active save that's missing one of the per-kind sentinel
 * columns. Used by the "Backfill" button in settings.
 */
export async function enqueueAllMissing(): Promise<{
  scheduled: number;
}> {
  const db = await getDb();
  let scheduled = 0;
  const rows = await db.select().from(saves).where(isNull(saves.deletedAt));
  for (const r of rows) {
    const kinds: EnrichJobKind[] = [];
    if (!r.dominantColors || (r.dominantColors as unknown[]).length === 0) {
      kinds.push("colors");
    }
    if (!r.aiCaption || !r.classification) kinds.push("vision");
    if (!r.articleHtml && r.source === "article") kinds.push("article");
    if (!r.embeddingUpdatedAt) kinds.push("embed");
    if (kinds.length === 0) continue;
    await enqueue(r.id, kinds);
    scheduled += kinds.length;
  }
  return { scheduled };
}

void and;
void or;
void lte;
