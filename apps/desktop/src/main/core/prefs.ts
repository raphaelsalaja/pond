import {
  type AiProviderConfig,
  DEFAULT_AI_AUTONOMY,
  DEFAULT_AI_PROVIDER,
  DEFAULT_PREFS,
  DEFAULT_VIDEO_DOWNLOAD,
  type Prefs,
  type SavedFilterView,
  settings as settingsTable,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import { migrateLegacyParams } from "@pond/schema/filters/migrate";
import { writeQuery } from "@pond/schema/filters/url";
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

let cachedProvider: AiProviderConfig | null = null;

export function invalidateAiProviderConfig(): void {
  cachedProvider = null;
}

export async function getAiProviderConfig(): Promise<AiProviderConfig> {
  if (cachedProvider) return cachedProvider;
  try {
    const db = await getDb();
    const rows = await db
      .select({ aiProvider: settingsTable.aiProvider })
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    const value = rows[0]?.aiProvider ?? DEFAULT_AI_PROVIDER;
    cachedProvider = normalizeProvider(value);
    return cachedProvider;
  } catch (err) {
    log.warn("[pond prefs] failed to read aiProvider, using defaults", err);
    return DEFAULT_AI_PROVIDER;
  }
}

export async function setAiProviderConfig(
  next: Partial<AiProviderConfig>,
): Promise<AiProviderConfig> {
  const current = await getAiProviderConfig();
  const merged = normalizeProvider({
    ...current,
    ...next,
    models: { ...current.models, ...(next.models ?? {}) },
  });
  const db = await getDb();
  await db
    .insert(settingsTable)
    .values({
      id: "singleton",
      aiAutonomy: DEFAULT_AI_AUTONOMY,
      aiProvider: merged,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { aiProvider: merged, updatedAt: new Date() },
    })
    .run();
  cachedProvider = merged;
  return merged;
}

/* ------------------------------------------------------------------ */
/* Section-keyed user prefs blob.                                      */
/*                                                                    */
/* Stored as one JSON column on the settings singleton, surfaced via   */
/* `settings.getPrefs` / `settings.setPrefs` IPCs. Renderer wraps the  */
/* round-trip in a typed `usePrefs(<section>)` hook (see              */
/* renderer/pool/prefs.ts). Cache mirrors the same stale-after-write   */
/* contract used by the older callers above.                           */
/* ------------------------------------------------------------------ */

let cachedPrefs: Prefs | null = null;

export function invalidatePrefs(): void {
  cachedPrefs = null;
}

export async function getPrefs(): Promise<Prefs> {
  if (cachedPrefs) return cachedPrefs;
  try {
    const db = await getDb();
    const rows = await db
      .select({ prefs: settingsTable.prefs })
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    const stored = rows[0]?.prefs;
    const merged = mergePrefs(DEFAULT_PREFS, stored);
    const { changed: filtersChanged, prefs: filtersMigrated } =
      migrateSavedFilters(merged);
    const { changed: syncChanged, prefs: migrated } =
      scrubLegacySyncFields(filtersMigrated);
    const changed = filtersChanged || syncChanged;
    cachedPrefs = migrated;
    if (changed) {
      // Persist back so the migration only runs once per install.
      // Errors here aren't fatal — we cache the migrated value
      // either way and the next save attempt will retry.
      await db
        .insert(settingsTable)
        .values({
          id: "singleton",
          aiAutonomy: DEFAULT_AI_AUTONOMY,
          prefs: migrated,
        })
        .onConflictDoUpdate({
          target: settingsTable.id,
          set: { prefs: migrated, updatedAt: new Date() },
        })
        .run();
      if (filtersChanged) {
        log.info("[pond prefs] migrated legacy saved filter views");
      }
      if (syncChanged) {
        log.info("[pond prefs] scrubbed legacy backfillState from sync prefs");
      }
    }
    return cachedPrefs;
  } catch (err) {
    log.warn("[pond prefs] failed to read prefs, using defaults", err);
    return DEFAULT_PREFS;
  }
}

/**
 * Deep-merge the patch onto the persisted prefs. The patch is at most
 * one level deep — keys are section names (e.g. `notifications`),
 * values are partial section objects. Anything below that is
 * shallow-merged so callers can update single fields without echoing
 * the whole section back.
 */
export async function setPrefs(patch: DeepPartial<Prefs>): Promise<Prefs> {
  const current = await getPrefs();
  const merged = mergePrefs(current, patch);
  const db = await getDb();
  await db
    .insert(settingsTable)
    .values({
      id: "singleton",
      aiAutonomy: DEFAULT_AI_AUTONOMY,
      prefs: merged,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { prefs: merged, updatedAt: new Date() },
    })
    .run();
  cachedPrefs = merged;
  return merged;
}

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function mergePrefs(
  base: Prefs,
  patch: DeepPartial<Prefs> | null | undefined,
): Prefs {
  if (!patch || typeof patch !== "object") return base;
  // We intentionally walk the prefs object as an untyped record — TS
  // can't see that base[key] and patch[key] share the same section
  // shape, and forcing it through a typed loop fights the type system
  // for no payoff. The IPC handler validates the shape (the renderer
  // can't fabricate keys past the typed `usePrefs` hook).
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

/**
 * One-shot migration: rewrite every saved view's `params` from the
 * legacy URL keys (`tag=foo`, `source=arena`, `imported=1mo`, …)
 * into the new compact form (`f.tags=every:foo`, `f.source=in:arena`,
 * `f.savedAt=gte:-P30D`, …). Run on first read so existing libraries
 * pick the new shape up automatically.
 *
 * Returns `{ changed }` so the caller can persist back when the
 * migration actually mutated anything.
 */
function migrateSavedFilters(prefs: Prefs): {
  changed: boolean;
  prefs: Prefs;
} {
  const saved = prefs.views?.saved ?? [];
  if (saved.length === 0) return { changed: false, prefs };
  let changed = false;
  const next: SavedFilterView[] = saved.map((view) => {
    const params = view.params ?? {};
    if (isAlreadyMigrated(params)) return view;
    const query = migrateLegacyParams(params);
    if (!query) return view;
    const out = writeQuery(new URLSearchParams(), query);
    const flat: Record<string, string> = {};
    for (const [k, v] of out.entries()) flat[k] = v;
    changed = true;
    return { ...view, params: flat, updatedAt: Date.now() };
  });
  return changed
    ? { changed: true, prefs: { ...prefs, views: { saved: next } } }
    : { changed: false, prefs };
}

function isAlreadyMigrated(params: Record<string, string>): boolean {
  for (const key of Object.keys(params)) {
    if (key === "q" || key.startsWith("f.")) return true;
  }
  return false;
}

/**
 * One-shot scrub: sync used to carry a `backfillState` field on every
 * source's prefs to gate "incremental vs backfill" mode promotion.
 * That whole concept is gone — there's just one sync that walks the
 * full list — so any leftover `backfillState` keys in the persisted
 * prefs blob are stale and need to disappear, otherwise users whose
 * field got wedged at `"complete"` would have no way to recover
 * (the value was previously what kept the cron from doing anything
 * useful).
 *
 * Pure data scrub; doesn't touch the rest of `prefs.sync`.
 */
function scrubLegacySyncFields(prefs: Prefs): {
  changed: boolean;
  prefs: Prefs;
} {
  const sync = prefs.sync as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!sync || typeof sync !== "object") return { changed: false, prefs };
  let changed = false;
  const next: Record<string, Record<string, unknown>> = {};
  for (const [source, cfg] of Object.entries(sync)) {
    if (!cfg || typeof cfg !== "object") {
      next[source] = cfg;
      continue;
    }
    if ("backfillState" in cfg) {
      const { backfillState: _drop, ...rest } = cfg;
      next[source] = rest;
      changed = true;
    } else {
      next[source] = cfg;
    }
  }
  if (!changed) return { changed: false, prefs };
  return {
    changed: true,
    prefs: { ...prefs, sync: next as Prefs["sync"] },
  };
}

function normalizeProvider(value: AiProviderConfig): AiProviderConfig {
  const allowed = new Set(["off", "local", "gateway", "direct"]);
  const kind = (allowed.has(value.kind) ? value.kind : "off") as
    | "off"
    | "local"
    | "gateway"
    | "direct";
  const baseUrl = value.baseUrl?.trim() || DEFAULT_AI_PROVIDER.baseUrl;
  const dim = Math.max(
    64,
    Math.min(8192, Math.floor(Number(value.embeddingDim) || 768)),
  );
  const budget =
    value.dailyBudgetUsd === null || value.dailyBudgetUsd === undefined
      ? null
      : Math.max(0, Number(value.dailyBudgetUsd));
  return {
    kind,
    baseUrl,
    models: {
      vision: value.models?.vision?.trim() || DEFAULT_AI_PROVIDER.models.vision,
      summary:
        value.models?.summary?.trim() || DEFAULT_AI_PROVIDER.models.summary,
      embedding:
        value.models?.embedding?.trim() || DEFAULT_AI_PROVIDER.models.embedding,
    },
    embeddingDim: dim,
    dailyBudgetUsd: budget,
    sendImages: value.sendImages !== false,
  };
}
