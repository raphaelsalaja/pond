import {
  DEFAULT_SOURCE_SYNC_PREFS,
  type Source,
  type SourceSyncPrefs,
  saves,
} from "@pond/schema/db";
import { and, eq, inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { ingestFromHttp } from "../ingest";
import { getPrefs, setPrefs } from "../prefs";
import {
  harvestSourceList,
  harvestTwitterBookmarks,
  harvestUrl,
  harvestYoutubeLikedList,
} from "../refresh/scrape-window";

/**
 * Background-sync orchestrator.
 *
 * The contract here is intentionally tiny: each source gets a single
 * `syncSource(<source>, opts)` entry point that runs to completion (or
 * a soft error) and yields progress events via the registered status
 * subscriber. The cron scheduler in `main/index.ts` calls
 * `syncAllSources` periodically; the renderer's "Sync now" button
 * calls `syncSource`. Everything funnels through the same code path
 * so a manual trigger and a cron tick produce identical state
 * transitions.
 *
 * For this slice we ship Twitter only. The orchestrator is shaped to
 * accept other sources by extending the `dispatch` switch — but we
 * deliberately avoid premature `harvestProfile<Source>` abstractions
 * until a second source actually plugs in. The comments in
 * `harvest/CAPTURE-STANDARD.md` describe the contract a future
 * source-bookmarks harvester needs to satisfy.
 */

export type SyncMode = "incremental" | "backfill";

export interface SyncOptions {
  mode?: SyncMode;
  /**
   * Surface a manual run vs. a scheduled run in logs / status events.
   * The orchestrator doesn't behave differently between the two, but
   * the renderer's status banner reads "Syncing…" for either, while
   * the developer log line distinguishes cron from button.
   */
  trigger?: "manual" | "cron";
}

export interface SyncStatusUpdate {
  source: Source;
  /** `idle` is what we send before the run starts and after it ends. */
  state: "idle" | "running" | "done" | "error" | "auth_required";
  /** Human-readable status message, shown verbatim under the source page. */
  message?: string;
  /** When known, the progress through the bookmarks queue. */
  progress?: { current: number; total: number };
  /** ISO timestamp of the last successful run, surfaced in the UI. */
  lastSyncedAt?: string | null;
  /** Set when the run hit a soft failure (auth wall, navigation error). */
  lastError?: string | null;
}

type StatusListener = (update: SyncStatusUpdate) => void;
const listeners = new Set<StatusListener>();

const inFlight = new Map<Source, AbortController>();

export function subscribeToSyncStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(update: SyncStatusUpdate): void {
  for (const cb of listeners) {
    try {
      cb(update);
    } catch (err) {
      log.warn("[pond sync] status listener threw", err);
    }
  }
}

/**
 * Read the persisted sync prefs for a source, materialising defaults
 * for sources that haven't been touched yet. Saves callers from having
 * to handle the `undefined` shape every time.
 */
export async function getSourceSync(source: Source): Promise<SourceSyncPrefs> {
  const prefs = await getPrefs();
  return prefs.sync[source] ?? { ...DEFAULT_SOURCE_SYNC_PREFS };
}

/**
 * Persist a partial patch onto `prefs.sync[source]`. Wrapped here so
 * callers don't have to know the round-trip nesting; `setPrefs`
 * shallow-merges sections, so we precompute the merged section.
 */
export async function patchSourceSync(
  source: Source,
  patch: Partial<SourceSyncPrefs>,
): Promise<SourceSyncPrefs> {
  const prefs = await getPrefs();
  const current = prefs.sync[source] ?? { ...DEFAULT_SOURCE_SYNC_PREFS };
  const next: SourceSyncPrefs = { ...current, ...patch };
  await setPrefs({ sync: { ...prefs.sync, [source]: next } });
  return next;
}

/**
 * Sync every source whose pref bucket has `enabled: true` AND a
 * non-`off` cadence. Used by the cron registered in `main/index.ts`.
 */
export async function syncAllSources(opts: SyncOptions = {}): Promise<void> {
  const prefs = await getPrefs();
  for (const source of Object.keys(prefs.sync) as Source[]) {
    const cfg = prefs.sync[source];
    if (!cfg) continue;
    if (!cfg.enabled || cfg.cadence === "off") continue;
    try {
      await syncSource(source, opts);
    } catch (err) {
      log.warn("[pond sync] syncSource threw", source, err);
    }
  }
}

/**
 * Run the per-source sync pipeline. Currently only `twitter` is
 * implemented; calling `syncSource` for any other source is a no-op
 * that records `lastError = "unsupported"`.
 */
export async function syncSource(
  source: Source,
  opts: SyncOptions = {},
): Promise<void> {
  if (inFlight.has(source)) {
    log.info("[pond sync] already running, ignoring", source);
    return;
  }
  const controller = new AbortController();
  inFlight.set(source, controller);
  emit({ source, state: "running", message: "Starting…" });
  try {
    if (source === "twitter") {
      await syncTwitter(opts, controller.signal);
    } else if (LIST_HARVEST_SOURCES.has(source)) {
      await syncListSource(source, opts, controller.signal);
    } else {
      await patchSourceSync(source, { lastError: "unsupported" });
      emit({
        source,
        state: "error",
        message: "This source doesn't support background sync yet.",
        lastError: "unsupported",
      });
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[pond sync] fatal error", source, err);
    await patchSourceSync(source, { lastError: msg });
    emit({
      source,
      state: "error",
      message: msg,
      lastError: msg,
    });
  } finally {
    inFlight.delete(source);
  }
}

/**
 * Cancel an in-flight sync. The orchestrator just flips the abort
 * signal; the harvester loops check it between batches and bail out
 * cleanly. Safe to call when nothing is running (no-op).
 */
export function cancelSync(source: Source): void {
  const c = inFlight.get(source);
  if (c) c.abort();
}

export function isSyncing(source: Source): boolean {
  return inFlight.has(source);
}

/* ------------------------------------------------------------------ */
/* Generic list-harvest dispatch (Phase 3).                            */
/* ------------------------------------------------------------------ */

/** Sources with a Phase-3 list harvester wired up in `scrape-window`. */
export const LIST_HARVEST_SOURCES = new Set<Source>([
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "reddit",
  "tiktok",
]);

/**
 * Optional per-source profile slug. Saved under
 * `prefs.sync[<source>].lastError` is the wrong place — for Phase 3
 * we read `accountKey` lazily from the existing saves table (the
 * first sourceUrl we have for the source surfaces the handle/slug).
 * If we can't infer it, the run is short-circuited as
 * `auth_required` so the user can connect first.
 */
async function inferAccountKey(source: Source): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ url: saves.url, author: saves.author })
    .from(saves)
    .where(eq(saves.source, source))
    .limit(50);
  for (const row of rows) {
    const handle = handleFromUrl(source, row.url) ?? row.author ?? null;
    if (handle) return handle.replace(/^@/, "");
  }
  return null;
}

function handleFromUrl(source: Source, url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    switch (source) {
      case "tiktok": {
        const handle = segs[0];
        return handle?.startsWith("@") ? handle.slice(1) : (handle ?? null);
      }
      case "instagram":
      case "pinterest":
        return segs[0] ?? null;
      case "reddit":
        return segs[0] === "user" || segs[0] === "u" ? (segs[1] ?? null) : null;
      case "arena":
        return segs[0] ?? null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

const LIST_BACKFILL_CAP = 1_000;
const LIST_INCREMENTAL_CAP = 200;

async function syncListSource(
  source: Source,
  opts: SyncOptions,
  signal: AbortSignal,
): Promise<void> {
  const mode: SyncMode = opts.mode ?? "incremental";

  const db = await getDb();
  const knownRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(eq(saves.source, source));
  const knownIds = new Set<string>(knownRows.map((r) => r.sourceId));
  log.info(
    `[pond sync:${source}] starting (${mode}); ${knownIds.size} items already in library`,
  );
  emit({
    source,
    state: "running",
    message: `Reading your ${source} list…`,
  });

  let accountKey: string | undefined;
  if (
    source === "arena" ||
    source === "pinterest" ||
    source === "instagram" ||
    source === "reddit" ||
    source === "tiktok"
  ) {
    const inferred = await inferAccountKey(source);
    if (!inferred) {
      log.info(`[pond sync:${source}] no account key inferred`);
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Save one ${source} item first so Pond knows whose list to read.`,
        lastError: "auth_required",
      });
      return;
    }
    accountKey = inferred;
  }

  const harvest = await harvestSourceList(source, {
    knownIds: Array.from(knownIds),
    mode,
    maxItems: mode === "backfill" ? LIST_BACKFILL_CAP : LIST_INCREMENTAL_CAP,
    accountKey,
  });
  if (signal.aborted) return;

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Sign in to ${source} to enable background sync.`,
        lastError: "auth_required",
      });
      return;
    }
    await patchSourceSync(source, { lastError: harvest.reason });
    emit({
      source,
      state: "error",
      message: `Couldn't read list: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    return;
  }

  // YouTube: also walk Liked Videos so the sync covers both lists.
  const combined = harvest.entries;
  if (source === "youtube") {
    const liked = await harvestYoutubeLikedList({
      knownIds: Array.from(knownIds),
      mode,
      maxItems: mode === "backfill" ? LIST_BACKFILL_CAP : LIST_INCREMENTAL_CAP,
    });
    if (liked.ok) {
      const seen = new Set(combined.map((e) => e.sourceId));
      for (const e of liked.entries) {
        if (!seen.has(e.sourceId)) combined.push(e);
      }
    }
  }

  const fresh = combined.filter((e) => !knownIds.has(e.sourceId));
  if (fresh.length === 0) {
    const lastSyncedAt = new Date().toISOString();
    await patchSourceSync(source, { lastSyncedAt, lastError: null });
    emit({
      source,
      state: "done",
      message: "All caught up.",
      lastSyncedAt,
      lastError: null,
    });
    return;
  }

  log.info(`[pond sync:${source}] importing ${fresh.length} new items`);
  emit({
    source,
    state: "running",
    message: `Importing 0 of ${fresh.length}…`,
    progress: { current: 0, total: fresh.length },
  });

  let processed = 0;
  for (const entry of fresh) {
    if (signal.aborted) return;
    try {
      const harv = await harvestUrl({
        url: entry.url,
        source,
        sourceId: entry.sourceId,
      });
      if (harv.ok && harv.harvest) {
        const meta = harv.harvest.meta ?? {};
        if (entry.savedAt) {
          (meta as Record<string, unknown>).savedAt = entry.savedAt;
        }
        await ingestFromHttp({
          source,
          sourceId: entry.sourceId,
          url: entry.url,
          title: harv.harvest.title,
          description: harv.harvest.description,
          author: harv.harvest.author,
          mediaUrl: harv.harvest.mediaUrl,
          mediaUrls: harv.harvest.mediaUrls,
          mediaType: harv.harvest.mediaType,
          savedAt: entry.savedAt ? new Date(entry.savedAt) : new Date(),
          raw: {
            kind: `${source}-sync`,
            capturedAt: new Date().toISOString(),
            [source]: meta,
          },
        });
      } else if (harv.reason === "auth_required") {
        await patchSourceSync(source, { lastError: "auth_required" });
        emit({
          source,
          state: "auth_required",
          message: `Lost ${source} session — please re-connect.`,
          lastError: "auth_required",
        });
        return;
      }
    } catch (err) {
      log.warn(`[pond sync:${source}] per-item failure`, entry.sourceId, err);
    }
    processed += 1;
    emit({
      source,
      state: "running",
      message: `Importing ${processed} of ${fresh.length}…`,
      progress: { current: processed, total: fresh.length },
    });
  }

  const lastSyncedAt = new Date().toISOString();
  await patchSourceSync(source, { lastSyncedAt, lastError: null });
  emit({
    source,
    state: "done",
    message: `Imported ${processed} item${processed === 1 ? "" : "s"}.`,
    progress: { current: processed, total: fresh.length },
    lastSyncedAt,
    lastError: null,
  });
}

/* ------------------------------------------------------------------ */
/* Twitter implementation.                                             */
/* ------------------------------------------------------------------ */

const TWITTER_BACKFILL_CAP = 1_000;
const TWITTER_INCREMENTAL_CAP = 200;

async function syncTwitter(
  opts: SyncOptions,
  signal: AbortSignal,
): Promise<void> {
  const source: Source = "twitter";
  const mode: SyncMode = opts.mode ?? "incremental";

  // Step 1: read every existing twitter sourceId so the harvester can
  // bail out the moment it hits a known tweet (incremental mode) and
  // we can dedupe new ids before kicking off per-tweet harvests.
  const db = await getDb();
  const knownRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(eq(saves.source, source));
  const knownIds = new Set<string>(knownRows.map((r) => r.sourceId));
  log.info(
    `[pond sync:twitter] starting (${mode}); ${knownIds.size} tweets already in library`,
  );
  emit({
    source,
    state: "running",
    message: `Looking at your Twitter bookmarks…`,
  });

  // Step 2: scrape the bookmarks list.
  const harvest = await harvestTwitterBookmarks({
    knownIds: Array.from(knownIds),
    mode,
    maxItems:
      mode === "backfill" ? TWITTER_BACKFILL_CAP : TWITTER_INCREMENTAL_CAP,
  });
  if (signal.aborted) return;

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      log.info("[pond sync:twitter] auth wall");
      await patchSourceSync(source, {
        lastError: "auth_required",
      });
      emit({
        source,
        state: "auth_required",
        message: "Sign in to Twitter to enable background sync.",
        lastError: "auth_required",
      });
      return;
    }
    log.warn("[pond sync:twitter] harvest failed", harvest.reason);
    await patchSourceSync(source, {
      lastError: harvest.reason,
    });
    emit({
      source,
      state: "error",
      message: `Couldn't read bookmarks: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    return;
  }

  // Step 3: dedupe against the local library. The bookmarks harvester
  // already terminates on known ids in incremental mode; we re-check
  // here so a backfill run doesn't enqueue per-tweet harvests for
  // bookmarks the user already has.
  const fresh = harvest.entries.filter((e) => !knownIds.has(e.tweetId));
  if (fresh.length === 0) {
    log.info("[pond sync:twitter] nothing new");
    const lastSyncedAt = new Date().toISOString();
    await patchSourceSync(source, {
      lastSyncedAt,
      lastError: null,
    });
    emit({
      source,
      state: "done",
      message: "All caught up.",
      lastSyncedAt,
      lastError: null,
    });
    return;
  }

  log.info(`[pond sync:twitter] importing ${fresh.length} new bookmarks`);
  emit({
    source,
    state: "running",
    message: `Importing 0 of ${fresh.length} bookmarks…`,
    progress: { current: 0, total: fresh.length },
  });

  // Step 4: walk the new ids one at a time. Per-tweet harvest reuses the
  // same hidden window so we don't pay a new BrowserWindow cost; the
  // bookmarks scrape navigated us to the bookmarks list, but each
  // `harvestUrl` call drives the window to the per-tweet permalink
  // before scraping. Errors per-tweet are swallowed (we just skip and
  // continue) — a single bad tweet shouldn't fail the run.
  let processed = 0;
  for (const entry of fresh) {
    if (signal.aborted) {
      log.info("[pond sync:twitter] aborted by user");
      return;
    }
    try {
      const harv = await harvestUrl({
        url: entry.url,
        source,
        sourceId: entry.tweetId,
      });
      if (harv.ok && harv.harvest) {
        // Stamp the bookmarks-list timestamp onto the per-tweet payload
        // so the renderer can show "bookmarked 3 days ago" without a
        // second scrape. Lands under `raw.twitter.bookmarkedAt`.
        const meta = harv.harvest.meta ?? {};
        if (entry.bookmarkedAt) {
          (meta as Record<string, unknown>).bookmarkedAt = entry.bookmarkedAt;
        }
        await ingestFromHttp({
          source,
          sourceId: entry.tweetId,
          url: entry.url,
          title: harv.harvest.title,
          description: harv.harvest.description,
          author: harv.harvest.author,
          mediaUrl: harv.harvest.mediaUrl,
          mediaUrls: harv.harvest.mediaUrls,
          mediaType: harv.harvest.mediaType,
          // Use the bookmarks-list timestamp as the user-interaction
          // timestamp (`savedAt`). When Twitter omits it (rare), fall
          // back to the moment we ingested. `IngestPayload['savedAt']`
          // is post-transform here, so we pass a Date directly rather
          // than the string a Zod parse would normalise.
          savedAt: entry.bookmarkedAt
            ? new Date(entry.bookmarkedAt)
            : new Date(),
          raw: {
            kind: "twitter-sync",
            capturedAt: new Date().toISOString(),
            twitter: meta,
          },
        });
      } else if (harv.reason === "auth_required") {
        // Lost the session mid-run. Bubble up so the user re-connects.
        log.warn("[pond sync:twitter] auth required mid-run");
        await patchSourceSync(source, { lastError: "auth_required" });
        emit({
          source,
          state: "auth_required",
          message: "Lost Twitter session — please re-connect.",
          lastError: "auth_required",
        });
        return;
      } else {
        log.info(
          "[pond sync:twitter] skip tweet",
          entry.tweetId,
          harv.reason ?? "no_payload",
        );
      }
    } catch (err) {
      log.warn("[pond sync:twitter] per-tweet failure", entry.tweetId, err);
    }
    processed += 1;
    emit({
      source,
      state: "running",
      message: `Importing ${processed} of ${fresh.length} bookmarks…`,
      progress: { current: processed, total: fresh.length },
    });
  }

  const lastSyncedAt = new Date().toISOString();
  await patchSourceSync(source, {
    lastSyncedAt,
    lastError: null,
  });
  log.info(`[pond sync:twitter] done; imported ${processed}`);
  emit({
    source,
    state: "done",
    message: `Imported ${processed} bookmark${processed === 1 ? "" : "s"}.`,
    progress: { current: processed, total: fresh.length },
    lastSyncedAt,
    lastError: null,
  });
}

/**
 * Read-only count of a source's saves. The orchestrator doesn't use
 * this directly today but it's useful for the renderer ("12 of 47") so
 * we expose it through the same module the rest of the sync code
 * lives in.
 */
export async function countSavesForSource(source: Source): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: saves.id })
    .from(saves)
    .where(eq(saves.source, source));
  return rows.length;
}

/** Read-only multi-id existence check; used by external callers. */
export async function existingSourceIds(
  source: Source,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(and(eq(saves.source, source), inArray(saves.sourceId, ids)));
  return new Set(rows.map((r) => r.sourceId));
}
