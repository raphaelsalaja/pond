import {
  type MediaType,
  type NewSave,
  type NewTask,
  type Save,
  type SaveFile,
  saves,
  syncActions,
  tasks,
} from "@pond/schema/db";
import type { CaptureAuthor, RawJson } from "@pond/schema/raw";
import { and, eq, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../db";
import { broadcastSyncAction } from "../executor";
import { classifyUrlToSource } from "./extractors";
import { UnsupportedError } from "./extractors/errors";
import { kickReconciler } from "./reconciler";
import { maxAttemptsFor, planOps } from "./specs";
import { sourceIdFromUrl } from "./url";
import {
  TWEET_SCREENSHOT_DARK_KIND,
  TWEET_SCREENSHOT_LIGHT_KIND,
} from "./workers/capture-tweet";

export interface EnqueueResult {
  id: string;
  created: boolean;
  // True when an existing save was reset because it was previously failed
  // and a fresh seed was supplied — distinguishes the "no-op" case from
  // the "recovered a failed save" case at the call site.
  reseeded?: boolean;
}

export interface EnqueueSeed {
  rawJson: RawJson;
  title?: string | null;
  description?: string | null;
  author?: string | null;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  publishedAt?: Date | null;
  lang?: string | null;
}

export interface EnqueueOptions {
  trigger?: string;
  force?: boolean;
  // Pre-extracted capture data from an upstream source (e.g. the Twitter
  // bookmarks GraphQL response). When provided, the save row is populated
  // immediately and `harvest_metadata` skips its scrape via
  // `isFreshHarvest()` — saving a round-trip and dodging X.com's
  // per-partition rate limiter when syncing dozens of new bookmarks at
  // once.
  seed?: EnqueueSeed;
}

export async function enqueueSaveByUrl(
  rawUrl: string,
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const classification = classifyUrlToSource(normalizedUrl);
  if (!classification.source) {
    throw new UnsupportedError(`no extractor matches url: ${rawUrl}`);
  }
  const source = classification.source;
  const sourceId = sourceIdFromUrl(source, normalizedUrl);
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
    // Existing failed save + a usable seed = recovery path. Reset tasks
    // back to pending, write the seed onto the row, and the next
    // reconciler tick will run harvest_metadata (which short-circuits via
    // `isFreshHarvest`), then capture_tweet / fetch_blobs / finalize.
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
      // Additive enrichment: an existing (non-failed) save predates the
      // parser update that started extracting a field the sync now hands us
      // — most commonly `capture.author.avatarUrl`. Merge anything new from
      // the seed into `rawJson` without touching values the save already
      // has, and re-pend the downstream worker so the new field actually
      // lands as a file on disk.
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
    url: normalizedUrl,
    status: "ingesting",
    ingestStartedAt: now,
    tags: [],
    files: [],
    coverIndex: 0,
    savedAt: now,
    createdAt: now,
    ...(opts.seed ? seedToInsertColumns(opts.seed) : {}),
  };
  db.insert(saves).values(insertValues).run();

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
  db.insert(tasks).values(taskRows).run();

  const insertedAction = db
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

// enqueueCaptureTweetForExisting — idempotent backfill that schedules a
// `capture_tweet` task for every twitter save that doesn't already have
// both the light and dark screenshot variants on disk. Runs for tweets
// with media too: the screenshot is the canonical thumbnail, the
// extracted media is the detail-carousel content. Safe to call on every
// app start — existing tasks for the same `(saveId, op)` pair are left
// alone, so re-running never duplicates work.
export async function enqueueCaptureTweetForExisting(): Promise<{
  scheduled: number;
}> {
  const db = await getDb();
  const rows = db
    .select()
    .from(saves)
    .where(and(eq(saves.source, "twitter"), isNull(saves.deletedAt)))
    .all();

  const needCapture: string[] = [];
  for (const row of rows) {
    const files = (row.files ?? []) as SaveFile[];
    const hasLight = files.some((f) => f.kind === TWEET_SCREENSHOT_LIGHT_KIND);
    const hasDark = files.some((f) => f.kind === TWEET_SCREENSHOT_DARK_KIND);
    if (hasLight && hasDark) continue;
    needCapture.push(row.id);
  }
  if (needCapture.length === 0) {
    return { scheduled: 0 };
  }

  const existing = db
    .select({ saveId: tasks.saveId })
    .from(tasks)
    .where(eq(tasks.op, "capture_tweet"))
    .all();
  const alreadyQueued = new Set(existing.map((r) => r.saveId));

  const now = new Date();
  const toInsert: NewTask[] = [];
  for (const saveId of needCapture) {
    if (alreadyQueued.has(saveId)) continue;
    toInsert.push({
      id: ulid(),
      saveId,
      op: "capture_tweet",
      status: "pending",
      attempts: 0,
      maxAttempts: maxAttemptsFor("capture_tweet"),
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toInsert.length === 0) {
    return { scheduled: 0 };
  }
  db.insert(tasks).values(toInsert).run();
  log.info(
    "[pond pipeline:capture-tweet] backfill scheduled",
    toInsert.length,
    "saves",
  );
  kickReconciler();
  return { scheduled: toInsert.length };
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

function seedToInsertColumns(seed: EnqueueSeed): Partial<NewSave> {
  const out: Partial<NewSave> = { rawJson: seed.rawJson };
  if (seed.title !== undefined) out.title = seed.title;
  if (seed.description !== undefined) out.description = seed.description;
  if (seed.author !== undefined) out.author = seed.author;
  if (seed.mediaUrl !== undefined) out.mediaUrl = seed.mediaUrl;
  if (seed.mediaType !== undefined) out.mediaType = seed.mediaType;
  if (seed.publishedAt !== undefined) out.publishedAt = seed.publishedAt;
  if (seed.lang !== undefined) out.lang = seed.lang;
  return out;
}

async function applySeedToExistingSave(
  saveId: string,
  seed: EnqueueSeed,
): Promise<void> {
  const db = await getDb();
  const patch = seedToInsertColumns(seed);
  db.update(saves).set(patch).where(eq(saves.id, saveId)).run();
  const inserted = db
    .insert(syncActions)
    .values({
      modelName: "save",
      modelId: saveId,
      action: "U",
      data: patch as unknown,
      actor: "system",
      actorReason: "pipeline:enqueue:reseed",
      batchId: ulid(),
    })
    .returning()
    .all()[0];
  if (inserted) broadcastSyncAction(inserted);
}

interface SeedMerge {
  changed: boolean;
  filled: string[];
  didFillAvatarUrl: boolean;
  rawJson: RawJson | null;
}

// Additive merge: for each field the seed provides, fill it in only if
// the existing save doesn't already have a value. Never overwrites.
// Currently scoped to `capture.author.*` — that's where new extractor
// fields (avatarUrl, profileUrl) tend to show up first; widen as needed.
function mergeSeedIntoExistingSave(
  current: Save,
  seed: EnqueueSeed,
): SeedMerge {
  const existingRaw =
    current.rawJson && typeof current.rawJson === "object"
      ? (current.rawJson as RawJson)
      : null;
  const seedRaw = seed.rawJson;

  const existingAuthor: CaptureAuthor = existingRaw?.capture?.author ?? {};
  const seedAuthor: CaptureAuthor = seedRaw.capture?.author ?? {};
  const nextAuthor: CaptureAuthor = { ...existingAuthor };
  const filled: string[] = [];
  let didFillAvatarUrl = false;
  for (const key of [
    "name",
    "handle",
    "avatarUrl",
    "profileUrl",
    "verified",
  ] as const) {
    const have = nextAuthor[key];
    const fresh = seedAuthor[key];
    if ((have === undefined || have === null || have === "") && fresh != null) {
      (nextAuthor[key] as unknown) = fresh;
      filled.push(`capture.author.${key}`);
      if (key === "avatarUrl") didFillAvatarUrl = true;
    }
  }

  if (filled.length === 0) {
    return { changed: false, filled, didFillAvatarUrl, rawJson: existingRaw };
  }

  const baseRaw = existingRaw ?? seedRaw;
  const nextRaw: RawJson = {
    ...baseRaw,
    capture: {
      ...(existingRaw?.capture ?? seedRaw.capture),
      author: nextAuthor,
    },
  };

  return { changed: true, filled, didFillAvatarUrl, rawJson: nextRaw };
}

async function persistEnrichment(
  saveId: string,
  merge: SeedMerge,
): Promise<void> {
  if (!merge.changed || !merge.rawJson) return;
  const db = await getDb();
  const patch: Partial<NewSave> = { rawJson: merge.rawJson };
  db.update(saves).set(patch).where(eq(saves.id, saveId)).run();
  const inserted = db
    .insert(syncActions)
    .values({
      modelName: "save",
      modelId: saveId,
      action: "U",
      data: { filled: merge.filled } as unknown,
      actor: "system",
      actorReason: "pipeline:enqueue:enrich",
      batchId: ulid(),
    })
    .returning()
    .all()[0];
  if (inserted) broadcastSyncAction(inserted);
}

// Newly-filled avatar URL only lands on disk if `fetch_avatar` runs
// again — its prior pass for this save was a no-op (rawJson had no URL).
// Only re-pend `done` rows: `pending`/`running` will pick up the new
// rawJson on their natural run, and reviving `failed`/`blocked` here
// would step on whatever signal pushed them there.
async function rependFetchAvatar(saveId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  db.update(tasks)
    .set({ status: "pending", nextRunAt: now, lastError: null, updatedAt: now })
    .where(
      and(
        eq(tasks.saveId, saveId),
        eq(tasks.op, "fetch_avatar"),
        eq(tasks.status, "done"),
      ),
    )
    .run();
}

function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    // Strip common tracking parameters; harmless for canonical equality.
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
