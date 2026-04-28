import {
  DEFAULT_AI_AUTONOMY,
  DEFAULT_VIDEO_DOWNLOAD,
  settings as settingsTable,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";

/**
 * Tiny in-process cache for the user-tunable yt-dlp / ffmpeg knobs.
 *
 * yt-dlp downloads are I/O-heavy and infrequent (one per save, ~30-90s
 * each), so a SQLite read per call wouldn't be a problem on its own.
 * The cache exists so the auto-video queue can decide whether to even
 * enqueue a job without paying a round-trip through Drizzle on every
 * harvested save — when `enabled === false` the queue should be a
 * no-op, not a cache lookup + select.
 *
 * Invalidation is explicit (`invalidateVideoDownloadPrefs()`); the
 * settings IPC writer calls it after persisting. The cache is tiny
 * and the data is tiny, so there's no TTL — stale-after-write is the
 * only failure mode and we control every writer.
 */

let cached: VideoDownloadSettings | null = null;

export function invalidateVideoDownloadPrefs(): void {
  cached = null;
}

export async function getVideoDownloadPrefs(): Promise<VideoDownloadSettings> {
  if (cached) return cached;
  try {
    const db = await getDb();
    const rows = await db
      .select({ videoDownload: settingsTable.videoDownload })
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    const row = rows[0];
    const value = row?.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD;
    cached = normalize(value);
    return cached;
  } catch (err) {
    log.warn("[pond prefs] failed to read videoDownload, using defaults", err);
    return DEFAULT_VIDEO_DOWNLOAD;
  }
}

/**
 * Persist new prefs and refresh the cache. Validates + clamps values
 * so a malformed renderer payload can't, e.g., set `maxFileSizeMb` to
 * `-1` and trip yt-dlp's argument parser.
 */
export async function setVideoDownloadPrefs(
  next: Partial<VideoDownloadSettings>,
): Promise<VideoDownloadSettings> {
  const current = await getVideoDownloadPrefs();
  const merged = normalize({ ...current, ...next });
  const db = await getDb();
  await db
    .insert(settingsTable)
    .values({
      id: "singleton",
      aiAutonomy: DEFAULT_AI_AUTONOMY,
      videoDownload: merged,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { videoDownload: merged, updatedAt: new Date() },
    })
    .run();
  cached = merged;
  return merged;
}

const ALLOWED_HEIGHTS = new Set([480, 720, 1080, 1440, 2160]);

function normalize(value: VideoDownloadSettings): VideoDownloadSettings {
  return {
    enabled: Boolean(value.enabled),
    maxHeight: clampHeight(value.maxHeight),
    maxFileSizeMb: clampFilesize(value.maxFileSizeMb),
  };
}

function clampHeight(h: VideoDownloadSettings["maxHeight"]): number | null {
  if (h === null || h === undefined) return null;
  const n = Math.floor(Number(h));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (ALLOWED_HEIGHTS.has(n)) return n;
  // Snap unknown heights to the nearest allowed bucket so users editing
  // the JSON by hand get a sensible result instead of silent breakage.
  let best = 1080;
  let bestDelta = Math.abs(best - n);
  for (const bucket of ALLOWED_HEIGHTS) {
    const d = Math.abs(bucket - n);
    if (d < bestDelta) {
      best = bucket;
      bestDelta = d;
    }
  }
  return best;
}

function clampFilesize(
  mb: VideoDownloadSettings["maxFileSizeMb"],
): number | null {
  if (mb === null || mb === undefined) return null;
  const n = Math.floor(Number(mb));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Hard ceiling: 10GB. Past that the user almost certainly wants
  // "unlimited" (`null`) and the cap is just protecting them from a
  // typo. Still allow it though.
  return Math.min(n, 10_000);
}
