import { type Source, saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { ingestFromHttp } from "./ingest";
import { supportsYtDlp } from "./refresh/sources";
import { downloadVideo } from "./refresh/yt-dlp";

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
}

/** Pending jobs, keyed by saveId so re-enqueues collapse. */
const pending = new Map<string, AutoVideoJob>();

/** Save IDs whose download is currently in flight. */
const inFlight = new Set<string>();

/** True while the worker loop is draining `pending`. */
let draining = false;

/**
 * Enqueue a save for background video download. Idempotent — calling
 * twice for the same saveId before the first job runs collapses to one.
 *
 * Returns immediately. The caller does NOT await the download; the
 * point is that the HTTP request thread stays free.
 */
export function enqueueAutoVideoDownload(job: AutoVideoJob): void {
  if (!supportsYtDlp(job.source)) return;
  if (inFlight.has(job.saveId) || pending.has(job.saveId)) return;
  pending.set(job.saveId, job);
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
      try {
        await processJob(job);
      } catch (err) {
        log.warn("[pond auto-video] job threw", saveId, err);
      } finally {
        inFlight.delete(saveId);
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
  if (hasVideo) {
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
    // overwrites fields when the new value is "richer").
    const payload: IngestPayload = {
      source: job.source,
      sourceId: job.sourceId,
      url: job.url,
    };
    await ingestFromHttp(payload, {
      mediaFiles: [{ path: dl.path, mimeType: dl.mimeType }],
    });
    log.info("[pond auto-video] merged video into save", {
      saveId: job.saveId,
      bytes: dl.size,
    });
  } finally {
    await dl.cleanup();
  }
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
