import {
  type NewSave,
  type NewTask,
  saves,
  syncActions,
  tasks,
} from "@pond/schema/db";
import { domainFromUrl } from "@pond/schema/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../db";
import { broadcastSyncAction } from "../executor";
import { persistSave } from "../persist-save";
import { classifyUrlToSource } from "./extractors";
import { UnsupportedError } from "./extractors/errors";
import { kickReconciler } from "./reconciler";
import {
  applySeedToExistingSave,
  type EnqueueSeed,
  mergeSeedIntoExistingSave,
  persistEnrichment,
  rependFetchAvatar,
  seedToInsertColumns,
} from "./seed";
import { maxAttemptsFor, planOps } from "./specs";
import { sourceIdFromUrl } from "./url";

interface EnqueueResult {
  id: string;
  created: boolean;
  /** Set when a previously-failed save was reset with a fresh seed. */
  reseeded?: boolean;
}

export interface EnqueueOptions {
  trigger?: string;
  force?: boolean;
  /** Pre-extracted capture data; lets harvest_metadata skip its scrape via isFreshHarvest(). */
  seed?: EnqueueSeed;
  /** Connected account that produced this save (sync runs); stamped on new rows. */
  accountId?: string | null;
}

export async function enqueueSaveByUrl(
  rawUrl: string,
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const classification = classifyUrlToSource(normalizedUrl);
  // #region agent log
  fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "384c19",
    },
    body: JSON.stringify({
      sessionId: "384c19",
      runId: "post-fix",
      hypothesisId: "A",
      location: "enqueue.ts:enqueueSaveByUrl",
      message: "classify result",
      data: {
        rawUrl,
        normalizedUrl,
        source: classification.source,
        extractorId: classification.extractorId,
        trigger: opts.trigger ?? null,
        isHandleLessTiktok: /tiktok\.com\/video\/\d+/i.test(normalizedUrl),
        isHandleTiktok: /tiktok\.com\/@[^/]+\/video\/\d+/i.test(normalizedUrl),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!classification.source) {
    throw new UnsupportedError(`no extractor matches url: ${rawUrl}`);
  }
  const source = classification.source;
  const sourceId = sourceIdFromUrl(source, normalizedUrl);
  // #region agent log
  fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "384c19",
    },
    body: JSON.stringify({
      sessionId: "384c19",
      runId: "post-fix",
      hypothesisId: "D",
      location: "enqueue.ts:enqueueSaveByUrl",
      message: "sourceId derived",
      data: {
        source,
        sourceId,
        normalizedUrl,
        trigger: opts.trigger ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!sourceId) {
    throw new UnsupportedError(
      `could not derive sourceId for ${normalizedUrl}`,
    );
  }

  const db = await getDb();
  const existing = await db
    .select()
    .from(saves)
    .where(and(eq(saves.source, source), eq(saves.sourceId, sourceId)));
  const current = existing[0];

  if (current) {
    /** Failed save + seed = recovery: reset tasks to pending and write the seed. */
    if (opts.seed && current.status === "failed") {
      await resetTasksForSave(
        current.id,
        opts.trigger ?? "enqueue:reseed-failed",
      );
      await applySeedToExistingSave(current.id, opts.seed);
      kickReconciler();
      log.info("[pond pipeline:enqueue] reseeded failed save", {
        id: current.id,
        source,
        trigger: opts.trigger,
      });
      return { id: current.id, created: false, reseeded: true };
    }
    if (opts.force) {
      await resetTasksForSave(current.id, opts.trigger ?? "enqueue:force");
    } else if (opts.seed) {
      /** Additive enrichment: merge new seed fields into rawJson without overwriting existing. */
      const merge = mergeSeedIntoExistingSave(current, opts.seed);
      if (merge.changed) {
        await persistEnrichment(current.id, merge);
        if (merge.didFillAvatarUrl) {
          await rependFetchAvatar(current.id);
        }
        log.info("[pond pipeline:enqueue] enriched existing save", {
          id: current.id,
          source,
          trigger: opts.trigger,
          filled: merge.filled,
        });
      }
    }
    kickReconciler();
    log.info("[pond pipeline:enqueue] existing save", {
      id: current.id,
      source,
      trigger: opts.trigger,
      force: opts.force === true,
    });
    return { id: current.id, created: false };
  }

  const id = ulid();
  const now = new Date();
  const insertValues: NewSave = {
    id,
    source,
    sourceId,
    accountId: opts.accountId ?? null,
    url: normalizedUrl,
    siteName: domainFromUrl(normalizedUrl),
    status: "ingesting",
    ingestStartedAt: now,
    tags: [],
    files: [],
    coverIndex: 0,
    savedAt: now,
    createdAt: now,
    ...(opts.seed ? seedToInsertColumns(opts.seed) : {}),
  };

  const ops = planOps(source);
  const taskRows: NewTask[] = ops.map((op) => ({
    id: ulid(),
    saveId: id,
    op,
    status: "pending",
    attempts: 0,
    maxAttempts: maxAttemptsFor(op),
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  }));

  /** One transaction so a crash cannot leave a half-ingested save, and one fsync instead of three. */
  const insertedAction = db.transaction((tx) => {
    tx.insert(saves).values(insertValues).run();
    tx.insert(tasks).values(taskRows).run();
    return tx
      .insert(syncActions)
      .values({
        modelName: "save",
        modelId: id,
        action: "I",
        data: insertValues as unknown,
        actor: opts.trigger?.startsWith("user:") ? "user" : "system",
        actorReason: opts.trigger ?? "pipeline:enqueue",
        batchId: ulid(),
      })
      .returning()
      .all()[0];
  });
  if (insertedAction) broadcastSyncAction(insertedAction);

  log.info("[pond pipeline:enqueue] created save", {
    id,
    source,
    sourceId,
    trigger: opts.trigger,
  });
  kickReconciler();
  return { id, created: true };
}

export async function resetTasksForSave(
  saveId: string,
  reason: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  db.update(tasks)
    .set({
      status: "pending",
      attempts: 0,
      lastError: null,
      nextRunAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.saveId, saveId))
    .run();
  db.update(saves)
    .set({ status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null })
    .where(eq(saves.id, saveId))
    .run();
  log.info("[pond pipeline:enqueue] reset tasks", { saveId, reason });
}

/** Resets only each save's failed tasks back to pending (done steps stay done); flipping to `ingesting` via persistSave lets the reconciler pick it up and broadcasts the change. */
export async function retryFailedSaves(
  ids?: readonly string[],
): Promise<number> {
  const db = await getDb();
  const scoped = ids != null && ids.length > 0;
  const rows = scoped
    ? db
        .select({ id: saves.id })
        .from(saves)
        .where(and(eq(saves.status, "failed"), inArray(saves.id, [...ids])))
        .all()
    : db
        .select({ id: saves.id })
        .from(saves)
        .where(and(eq(saves.status, "failed"), isNull(saves.deletedAt)))
        .all();
  if (rows.length === 0) return 0;

  const now = new Date();
  for (const { id } of rows) {
    db.update(tasks)
      .set({
        status: "pending",
        attempts: 0,
        lastError: null,
        nextRunAt: now,
        updatedAt: now,
      })
      .where(and(eq(tasks.saveId, id), eq(tasks.status, "failed")))
      .run();
    await persistSave(
      id,
      { status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null },
      { actorReason: "pipeline:retry-failed" },
    );
  }

  log.info("[pond pipeline:enqueue] retry failed saves", {
    requeued: rows.length,
    scoped,
  });
  kickReconciler();
  return rows.length;
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    /** Strip common tracking parameters; harmless for canonical equality. */
    for (const key of Array.from(u.searchParams.keys())) {
      if (
        key.startsWith("utm_") ||
        key === "fbclid" ||
        key === "igshid" ||
        key === "si"
      ) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}
