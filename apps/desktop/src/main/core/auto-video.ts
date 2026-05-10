import { type Source, saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { ingestFromHttp } from "./ingest";
import { getVideoDownloadPrefs } from "./prefs";
import { supportsYtDlp } from "./refresh/sources";
import { downloadVideo } from "./refresh/yt-dlp";
import { isAutoVideoBlockedByStorageGuard } from "./storage-watcher";

/**
 * Background queue that materialises the playable video bytes for a save
 * via yt-dlp, after the synchronous HTTP ingest has already landed the
 * thumbnail/poster.
 *
 * Why this exists:
 *   The extension captures `mediaUrl` = the source's still poster image
 *   (e.g. `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` for YouTube).
 *   `ingestFromHttp` fetches that synchronously so the card renders with
 *   a real cover the instant the user clicks Save. The actual MP4 takes
 *   30-90s to download via yt-dlp; we don't want the extension's HTTP
 *   round-trip blocking on that. So: respond 200 immediately, queue the
 *   video download, and merge the bytes in via a follow-up `update`
 *   transaction once yt-dlp finishes. The renderer's pool reconciler
 *   notices the new files[] entry and re-renders the card as a `<video
 *   poster=cover.jpg src=video.mp4>` — no flicker because the poster
 *   stays painted while the video bytes load.
 *
 * Concurrency: we run one yt-dlp at a time. The binary is CPU + network
 * heavy and parallelism rarely helps for a single user's bursty saves;
 * serialising also keeps RAM bounded since each download buffers the
 * full file before we hand it to `readLocalToTxFile`.
 *
 * Dedup: by saveId. If the same save is enqueued twice (e.g. user
 * re-saves before the first download finished), the second enqueue is
 * a no-op. We also re-check at job-pickup time whether the save already
 * has a video file on disk (e.g. a manual Refresh raced us), and skip
 * the spawn if so.
 *
 * Lifecycle: pure in-memory. Items lost on app restart are recoverable
 * via the user clicking Refresh on the card. Persisting the queue to
 * disk would be over-engineering for this iteration.
 */

interface AutoVideoJob {
  saveId: string;
  source: Source;
  sourceId: string;
  url: string;
  /**
   * When true, skip the "save already has a video file" guard and pass
   * `force: true` to `ingestFromHttp` so the new bytes overwrite the
   * existing on-disk video. Used by the auto-heal path triggered from
   * the renderer when a `<video>` element errors (e.g. an AV1/HEVC
   * file Electron can't decode).
   *
   * If a force job is enqueued while a non-force job for the same id
   * is pending, the force flag is preserved (we OR them together) so
   * the eventual run does the heavy heal.
   */
  force?: boolean;
}

/** Pending jobs, keyed by saveId so re-enqueues collapse. */
const pending = new Map<string, AutoVideoJob>();

/** Save IDs whose download is currently in flight. */
const inFlight = new Set<string>();

/** True while the worker loop is draining `pending`. */
let draining = false;

/** Snapshot of pending + in-flight save IDs. */
export interface AutoVideoStatus {
  pending: string[];
  inFlight: string[];
}

type StatusListener = (status: AutoVideoStatus) => void;
const statusListeners = new Set<StatusListener>();

/**
 * Subscribe to queue state changes. Listeners fire on every enqueue,
 * job-pickup, and job-completion so the renderer can paint a
 * "downloading…" indicator on cards whose video is currently being
 * materialised by yt-dlp. The callback is called immediately on
 * subscribe with the current snapshot so consumers don't need a
 * separate initial-fetch round-trip.
 */
export function subscribeToAutoVideoStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  cb(autoVideoQueueSnapshot());
  return () => statusListeners.delete(cb);
}

function notifyStatus(): void {
  if (statusListeners.size === 0) return;
  const snap = autoVideoQueueSnapshot();
  for (const cb of statusListeners) {
    try {
      cb(snap);
    } catch (err) {
      log.warn("[pond auto-video] status listener threw", err);
    }
  }
}

/**
 * Enqueue a save for background video download. Idempotent — calling
 * twice for the same saveId before the first job runs collapses to one.
 *
 * `force: true` jobs override an existing pending non-force job for
 * the same id. If a force job arrives while one is already in flight,
 * we re-enqueue so the second download lands after the first finishes
 * (we can't cancel an in-flight yt-dlp child cleanly).
 *
 * Returns immediately. The caller does NOT await the download; the
 * point is that the HTTP request thread stays free.
 */
export function enqueueAutoVideoDownload(job: AutoVideoJob): void {
  if (!supportsYtDlp(job.source)) return;
  // Honour the user's "background video downloads" toggle. Force jobs
  // (auto-heal of a broken file, manual Refresh from the menu) bypass
  // this gate — those are explicit user actions where the user is
  // *asking* for the bytes, not just passively saving a card.
  if (job.force !== true) {
    if (isAutoVideoBlockedByStorageGuard()) {
      log.debug("[pond auto-video] storage guard active, skipping", job.saveId);
      return;
    }
    void getVideoDownloadPrefs().then((prefs) => {
      if (!prefs.enabled) {
        log.debug(
          "[pond auto-video] background downloads disabled, skipping",
          job.saveId,
        );
        return;
      }
      enqueueResolved(job);
    });
    return;
  }
  enqueueResolved(job);
}

function enqueueResolved(job: AutoVideoJob): void {
  const existing = pending.get(job.saveId);
  if (existing) {
    pending.set(job.saveId, {
      ...existing,
      force: existing.force === true || job.force === true,
    });
    notifyStatus();
    return;
  }
  // For force jobs we always enqueue, even if an in-flight job exists,
  // so the heal definitely runs once with the new selector. For
  // non-force jobs we early-return as before to keep the queue tight.
  if (inFlight.has(job.saveId) && job.force !== true) return;
  pending.set(job.saveId, job);
  notifyStatus();
  // Kick the worker off the microtask queue so the caller's HTTP handler
  // can flush its response before we start spawning subprocesses.
  setImmediate(() => {
    void drain();
  });
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending.size > 0) {
      const next = pending.entries().next().value as
        | [string, AutoVideoJob]
        | undefined;
      if (!next) break;
      const [saveId, job] = next;
      pending.delete(saveId);
      inFlight.add(saveId);
      notifyStatus();
      try {
        await processJob(job);
      } catch (err) {
        log.warn("[pond auto-video] job threw", saveId, err);
      } finally {
        inFlight.delete(saveId);
        notifyStatus();
      }
    }
  } finally {
    draining = false;
  }
}

async function processJob(job: AutoVideoJob): Promise<void> {
  // Guard against racing a manual Refresh: if the user clicked Refresh
  // between enqueue and pickup, the row may already have a video file.
  // Skip the spawn instead of wastefully re-downloading the same bytes.
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, job.saveId));
  const current = rows[0];
  if (!current) {
    log.info(
      "[pond auto-video] save vanished before download started",
      job.saveId,
    );
    return;
  }
  const hasVideo = (current.files ?? []).some((f) => f.kind === "video");
  if (hasVideo && job.force !== true) {
    log.info(
      "[pond auto-video] save already has a video file, skipping",
      job.saveId,
    );
    return;
  }

  log.info("[pond auto-video] downloading", {
    saveId: job.saveId,
    source: job.source,
    url: job.url,
    force: job.force === true,
  });

  const dl = await downloadVideo({ url: job.url, source: job.source });
  if (!dl) {
    // downloadVideo() already logged the reason; fall through silently
    // so the user is not spammed with warnings for unsupported pages.
    return;
  }

  try {
    // Merge into the existing save via the standard ingest path. We
    // re-build the minimum payload from the row so the merge logic in
    // refreshExisting() doesn't downgrade title/description (it only
    // overwrites fields when the new value is "richer"). Lift the
    // `--write-info-json` sidecar's curated subset onto
    // `raw.<source>.ytdlp` so view/like/duration/chapters surface
    // without an extra extractor call.
    const payload: IngestPayload = {
      source: job.source,
      sourceId: job.sourceId,
      url: job.url,
      ...(dl.infoJson ? { raw: { [job.source]: { ytdlp: dl.infoJson } } } : {}),
    };
    await ingestFromHttp(payload, {
      mediaFiles: [{ path: dl.path, mimeType: dl.mimeType }],
      force: job.force === true,
    });
    log.info("[pond auto-video] merged video into save", {
      saveId: job.saveId,
      bytes: dl.size,
      force: job.force === true,
    });
  } finally {
    await dl.cleanup();
  }
}

/**
 * Look up a save by id and enqueue it for redownload with `force: true`.
 *
 * The renderer's auto-heal path (`<video onError>`) calls into here via
 * IPC. We keep the lookup on the main side so the renderer doesn't need
 * to know the save's `source`/`sourceId`/`url` — it just hands us an id
 * and trusts that we'll do the right thing.
 *
 * Outcomes:
 *   - "queued"      — happy path, redownload is now in the queue
 *   - "not_found"   — save id doesn't exist (race with delete)
 *   - "no_url"      — save row has no source URL to feed yt-dlp
 *   - "unsupported" — source isn't in the yt-dlp allowlist (image-only
 *                     gallery, RSS-style bookmark, etc.) — caller should
 *                     surface as "nothing we can do" without a retry
 */
export async function redownloadVideoForSave(saveId: string): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "no_url" | "unsupported";
    }
> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };
  if (!supportsYtDlp(current.source)) {
    return { ok: false, reason: "unsupported" };
  }
  enqueueAutoVideoDownload({
    saveId: current.id,
    source: current.source,
    sourceId: current.sourceId,
    url: current.url,
    force: true,
  });
  return { ok: true };
}

/**
 * Test / diagnostic helper. Returns a snapshot of the current queue
 * state — useful for the renderer to surface a "downloading…" badge in
 * a future iteration. Not used by the runtime path today.
 */
export function autoVideoQueueSnapshot(): {
  pending: string[];
  inFlight: string[];
} {
  return {
    pending: [...pending.keys()],
    inFlight: [...inFlight],
  };
}
