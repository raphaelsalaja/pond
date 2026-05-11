import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { type SaveFile, saves, syncActions } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../db";
import { extractFirstFrame } from "../lib/ffmpeg-frame";
import { readItemMetadata } from "../lib/library";
import { itemDir, itemFile } from "../paths";
import { broadcastSyncAction } from "./executor";
import { binariesAvailable } from "./refresh/binaries";

/**
 * Generate a real frame-0 still for every video save that doesn't have
 * one yet. Mirrors the auto-video queue shape: in-memory, dedup by
 * saveId, one job in flight at a time. Two entry points:
 *
 *   1. Startup pass — `enqueueAllMissing()` walks the saves table and
 *      schedules every video that lacks a `kind: "poster"` file. Runs
 *      idle in the background so the first window paint isn't delayed.
 *
 *   2. Per-save trigger — `enqueuePosterBackfill(saveId)` is called by
 *      `ingest.ts` after any `update`/`create` transaction that wrote
 *      a `kind: "video"` file without a paired generated poster. Covers
 *      direct-mp4 saves (extension drops a playable URL straight in
 *      without going through yt-dlp).
 *
 * Why a side-channel write instead of `executeTransaction`:
 *   The executor's `update` branch rewrites `metadata.files[]` to ONLY
 *   the newly-written files (it doesn't merge with existing). For a
 *   refresh that re-fetches every URL this is correct; for "append one
 *   derived file to a save that already has video + cover" it would
 *   wipe the existing entries unless we re-read + re-encode the full
 *   set. On a 1000-video library that's gigabytes of pointless disk
 *   churn. Backfill is pure-additive and doesn't need undo, so we
 *   write the poster + patch the index + emit a sync_action directly.
 *
 * Failure handling:
 *   `extractFirstFrame` returns `null` for missing ffmpeg / unsupported
 *   codec / timeout. We log at debug for the first case (binary not
 *   installed is a config issue, not a per-save error) and warn for
 *   the others. The save stays in the "missing poster" state and will
 *   be retried on next launch.
 */

interface PosterJob {
  saveId: string;
}

const pending = new Map<string, PosterJob>();
const inFlight = new Set<string>();
let draining = false;

export interface PosterBackfillStatus {
  pending: string[];
  inFlight: string[];
}

type StatusListener = (status: PosterBackfillStatus) => void;
const statusListeners = new Set<StatusListener>();

export function subscribeToPosterBackfillStatus(
  cb: StatusListener,
): () => void {
  statusListeners.add(cb);
  cb(posterBackfillSnapshot());
  return () => statusListeners.delete(cb);
}

function notifyStatus(): void {
  if (statusListeners.size === 0) return;
  const snap = posterBackfillSnapshot();
  for (const cb of statusListeners) {
    try {
      cb(snap);
    } catch (err) {
      log.warn("[pond poster-backfill] status listener threw", err);
    }
  }
}

export function posterBackfillSnapshot(): PosterBackfillStatus {
  return {
    pending: [...pending.keys()],
    inFlight: [...inFlight],
  };
}

/**
 * Schedule a single save for backfill. Idempotent — a no-op if the
 * save is already pending or in flight. Returns immediately; the
 * caller does NOT await the extraction.
 */
export function enqueuePosterBackfill(saveId: string): void {
  if (!saveId) return;
  if (pending.has(saveId) || inFlight.has(saveId)) return;
  pending.set(saveId, { saveId });
  notifyStatus();
  setImmediate(() => {
    void drain();
  });
}

/**
 * Walk every active save and enqueue any video that lacks a generated
 * poster. Returns the number of jobs scheduled so callers can decide
 * whether to surface progress. Cheap on a healthy library — one
 * SELECT, no filesystem walks.
 *
 * `force: true` enqueues every video save regardless of poster
 * presence — used by the manual "Regenerate Video Thumbnails" button
 * in Settings to recover from a partial backfill.
 */
export async function enqueueAllMissing(
  opts: { force?: boolean } = {},
): Promise<{
  scheduled: number;
}> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug(
      "[pond poster-backfill] ffmpeg unavailable, skipping startup pass",
    );
    return { scheduled: 0 };
  }
  const db = await getDb();
  const rows = await db.select().from(saves);
  let scheduled = 0;
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const files = row.files ?? [];
    const hasVideo = files.some((f) => f.kind === "video");
    if (!hasVideo) continue;
    if (!opts.force && files.some((f) => f.kind === "poster")) continue;
    enqueuePosterBackfill(row.id);
    scheduled++;
  }
  if (scheduled > 0) {
    log.info(`[pond poster-backfill] scheduled ${scheduled} jobs`);
  }
  return { scheduled };
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending.size > 0) {
      const next = pending.entries().next().value as
        | [string, PosterJob]
        | undefined;
      if (!next) break;
      const [saveId, job] = next;
      pending.delete(saveId);
      inFlight.add(saveId);
      notifyStatus();
      try {
        await processJob(job);
      } catch (err) {
        log.warn("[pond poster-backfill] job threw", saveId, err);
      } finally {
        inFlight.delete(saveId);
        notifyStatus();
      }
    }
  } finally {
    draining = false;
  }
}

async function processJob(job: PosterJob): Promise<void> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, job.saveId));
  const current = rows[0];
  if (!current) {
    log.debug(
      "[pond poster-backfill] save vanished before extraction",
      job.saveId,
    );
    return;
  }
  if (current.deletedAt !== null) return;

  const files = current.files ?? [];
  const videoFile = files.find((f) => f.kind === "video");
  if (!videoFile) {
    log.debug("[pond poster-backfill] no video file, skipping", job.saveId);
    return;
  }

  const videoPath = itemFile(job.saveId, videoFile.path);
  if (!existsSync(videoPath)) {
    log.warn(
      "[pond poster-backfill] video missing on disk, skipping",
      job.saveId,
      videoPath,
    );
    return;
  }

  const frame = await extractFirstFrame(videoPath);
  if (!frame) return;

  try {
    await appendPosterFile(current.id, frame.path, files);
  } finally {
    await frame.cleanup();
  }
}

/**
 * Write the generated poster JPEG into the item directory and patch
 * both the on-disk `metadata.json` and the SQLite `saves.files`
 * column to include the new entry. Emits a sync_action so live
 * renderers reconcile the pool without needing a full re-hydration.
 *
 * Naming: `poster.jpg`, or `poster-1.jpg` / `poster-2.jpg` / … when a
 * file with that name already exists (rare — only if the user manually
 * dropped something in the item dir).
 */
async function appendPosterFile(
  saveId: string,
  framePath: string,
  existingFiles: SaveFile[],
): Promise<void> {
  const db = await getDb();

  const ext = extname(framePath).toLowerCase() || ".jpg";
  let filename = `poster${ext}`;
  let suffix = 1;
  while (existingFiles.some((f) => f.path === filename)) {
    filename = `poster-${suffix}${ext}`;
    suffix++;
  }

  const buf = await readFile(framePath);
  if (buf.byteLength === 0) {
    log.warn("[pond poster-backfill] frame file empty, skipping", saveId);
    return;
  }

  const dir = itemDir(saveId);
  await writeFile(join(dir, filename), buf);

  const posterEntry: SaveFile = {
    kind: "poster",
    path: filename,
    sha256: createHash("sha256").update(buf).digest("hex"),
    size: buf.length,
    mimeType: "image/jpeg",
  };
  const nextFiles: SaveFile[] = [...existingFiles, posterEntry];

  // Update metadata.json so a future scan-library pass reading bytes
  // off disk agrees with the DB. Best-effort — if the file was deleted
  // out from under us we still update the DB and the next reconcile
  // pass will heal the metadata.
  try {
    const meta = await readItemMetadata(saveId);
    if (meta) {
      meta.files = nextFiles.map((f) => ({
        kind: f.kind,
        path: f.path,
        sha256: f.sha256,
        size: f.size,
      }));
      meta.mtime = Date.now();
      await writeFile(
        join(dir, "metadata.json"),
        JSON.stringify(meta, null, 2),
      );
    }
  } catch (err) {
    log.warn("[pond poster-backfill] metadata.json patch failed", saveId, err);
  }

  // Patch the DB row, then synthesise a sync_action so live renderers
  // see the new file in `pool/saves` without re-hydrating from scratch.
  await db
    .update(saves)
    .set({ files: nextFiles })
    .where(eq(saves.id, saveId))
    .run();

  const inserted = db
    .insert(syncActions)
    .values({
      modelName: "save",
      modelId: saveId,
      action: "U",
      data: { files: nextFiles },
      prevData: { files: existingFiles },
      actor: "system",
      actorReason: "poster-backfill",
      batchId: ulid(),
    })
    .returning()
    .all()[0];
  if (inserted) {
    broadcastSyncAction(inserted);
  }

  log.info("[pond poster-backfill] wrote poster", {
    saveId,
    filename,
    bytes: buf.byteLength,
  });
}
