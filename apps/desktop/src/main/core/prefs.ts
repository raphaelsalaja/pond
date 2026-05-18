import {
  DEFAULT_PREFS,
  DEFAULT_VIDEO_DOWNLOAD,
  type Prefs,
  settings as settingsTable,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";

interface SettingsCache {
  prefs: Prefs;
  videoDownload: VideoDownloadSettings;
}

let cache: SettingsCache | null = null;
let inflight: Promise<SettingsCache> | null = null;

function invalidate(): void {
  cache = null;
  inflight = null;
}

export function invalidatePrefs(): void {
  invalidate();
}

export function invalidateVideoDownloadPrefs(): void {
  invalidate();
}

async function loadSettings(): Promise<SettingsCache> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const db = await getDb();
      const rows = await db
        .select({
          prefs: settingsTable.prefs,
          videoDownload: settingsTable.videoDownload,
        })
        .from(settingsTable)
        .where(eq(settingsTable.id, "singleton"));
      const row = rows[0];
      cache = {
        prefs: mergePrefs(DEFAULT_PREFS, row?.prefs),
        videoDownload: normalize(row?.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD),
      };
      return cache;
    } catch (err) {
      log.warn("[pond prefs] failed to read settings, using defaults", err);
      return {
        prefs: DEFAULT_PREFS,
        videoDownload: DEFAULT_VIDEO_DOWNLOAD,
      };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function getPrefs(): Promise<Prefs> {
  return (await loadSettings()).prefs;
}

export async function getVideoDownloadPrefs(): Promise<VideoDownloadSettings> {
  return (await loadSettings()).videoDownload;
}

export async function setPrefs(patch: DeepPartial<Prefs>): Promise<Prefs> {
  const current = await loadSettings();
  const merged = mergePrefs(current.prefs, patch);
  const db = await getDb();
  await db
    .insert(settingsTable)
    .values({
      id: "singleton",
      prefs: merged,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { prefs: merged, updatedAt: new Date() },
    })
    .run();
  if (cache) cache = { ...cache, prefs: merged };
  return merged;
}

export async function setVideoDownloadPrefs(
  next: Partial<VideoDownloadSettings>,
): Promise<VideoDownloadSettings> {
  const current = await loadSettings();
  const merged = normalize({ ...current.videoDownload, ...next });
  const db = await getDb();
  await db
    .insert(settingsTable)
    .values({
      id: "singleton",
      videoDownload: merged,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { videoDownload: merged, updatedAt: new Date() },
    })
    .run();
  if (cache) cache = { ...cache, videoDownload: merged };
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
  return Math.min(n, 10_000);
}

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function mergePrefs(
  base: Prefs,
  patch: DeepPartial<Prefs> | null | undefined,
): Prefs {
  if (!patch || typeof patch !== "object") return base;
  const baseRec = base as unknown as Record<string, unknown>;
  const patchRec = patch as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...baseRec };
  for (const key of Object.keys(baseRec)) {
    const baseVal = baseRec[key];
    const patchVal = patchRec[key];
    if (patchVal && typeof patchVal === "object" && !Array.isArray(patchVal)) {
      out[key] = { ...(baseVal as object), ...(patchVal as object) };
    } else if (patchVal !== undefined) {
      out[key] = patchVal;
    }
  }
  return out as unknown as Prefs;
}
