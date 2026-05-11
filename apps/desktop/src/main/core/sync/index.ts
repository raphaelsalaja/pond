import {
  DEFAULT_SOURCE_SYNC_PREFS,
  type Source,
  type SourceSyncPrefs,
  saves,
} from "@pond/schema/db";
import type { RawTwitter, TwitterMediaItem } from "@pond/schema/raw";
import { and, eq, inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import { getDb } from "../../db";
import { ingestFromHttp } from "../ingest";
import { getPrefs, setPrefs } from "../prefs";
import type { ListEntry } from "../refresh/harvest/list-types";
import type { BookmarksEntry } from "../refresh/harvest/twitter";
import {
  harvestSourceList,
  harvestTwitterBookmarks,
  harvestUrl,
  harvestYoutubeLikedList,
  POOL_SIZE,
} from "../refresh/scrape-window";
import { isSyncBlockedByStorageGuard } from "../storage-watcher";

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

export interface SyncOptions {
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
  return { ...DEFAULT_SOURCE_SYNC_PREFS, ...prefs.sync[source] };
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
  const next: SourceSyncPrefs = {
    ...DEFAULT_SOURCE_SYNC_PREFS,
    ...prefs.sync[source],
    ...patch,
  };
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
 * Run the per-source sync pipeline. Sync's contract is "ensure every
 * item on the source's list is in the local library" — there is no
 * incremental-vs-backfill mode. Cron ticks and the "Sync Now" button
 * fan into the same operation. Currently `twitter` and the seven
 * list-harvest sources are wired up; anything else records
 * `lastError = "unsupported"`.
 */
export async function syncSource(
  source: Source,
  opts: SyncOptions = {},
): Promise<void> {
  if (inFlight.has(source)) {
    log.info("[pond sync] already running, ignoring", source);
    return;
  }
  if (isSyncBlockedByStorageGuard()) {
    log.info(
      "[pond sync] blocked by storage guard, skipping",
      source,
      opts.trigger ?? "manual",
    );
    emit({
      source,
      state: "error",
      message:
        "Paused — Pond storage cap reached. Free space or raise the cap.",
      lastError: "storage_cap_exceeded",
    });
    return;
  }
  const controller = new AbortController();
  inFlight.set(source, controller);
  emit({ source, state: "running", message: "Starting…" });
  try {
    if (source === "twitter") {
      await syncTwitter(controller.signal);
    } else if (LIST_HARVEST_SOURCES.has(source)) {
      await syncListSource(source, controller.signal);
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

// Per-run safety cap so a runaway page can't pin a single sync run
// forever; the next cron tick picks up whatever's left.
const LIST_MAX_ITEMS = 5;

// Rich entries skip the BrowserWindow pool — the bottleneck is the
// HTTP media fetches inside `ingestFromHttp`, not page rendering, so
// concurrency is bounded by typical broadband + remote CDN tolerance.
const RICH_INGEST_CONCURRENCY = 6;

async function syncListSource(
  source: Source,
  signal: AbortSignal,
): Promise<void> {
  const db = await getDb();
  const knownRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(eq(saves.source, source));
  const knownIds = new Set<string>(knownRows.map((r) => r.sourceId));
  log.info(
    `[pond sync:${source}] starting; ${knownIds.size} items already in library`,
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

  const harvest = await harvestSourceList(
    source,
    {
      knownIds: Array.from(knownIds),
      maxItems: LIST_MAX_ITEMS,
      accountKey,
    },
    {
      onProgress: (p) => {
        emit({
          source,
          state: "running",
          message: `Found ${p.collected} saved items${p.fresh > 0 ? ` (${p.fresh} new)` : ""}…`,
        });
      },
    },
  );
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
      maxItems: LIST_MAX_ITEMS,
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

  const richEntries = fresh.filter(entryHasRichData);
  const stubEntries = fresh.filter((e) => !entryHasRichData(e));

  log.info(
    `[pond sync:${source}] importing ${fresh.length} new items (${richEntries.length} rich, ${stubEntries.length} need harvest)`,
  );
  emit({
    source,
    state: "running",
    message: `Importing 0 of ${fresh.length}…`,
    progress: { current: 0, total: fresh.length },
  });

  let processed = 0;

  const reportProgress = () => {
    emit({
      source,
      state: "running",
      message: `Importing ${processed} of ${fresh.length}…`,
      progress: { current: processed, total: fresh.length },
    });
  };

  const ingestLimit = pLimit(RICH_INGEST_CONCURRENCY);
  await Promise.all(
    richEntries.map((entry) =>
      ingestLimit(async () => {
        if (signal.aborted) return;
        try {
          await ingestFromHttp({
            source,
            sourceId: entry.sourceId,
            url: entry.url,
            title: entry.title,
            description: entry.description,
            author: entry.author,
            mediaUrl: entry.mediaUrl,
            mediaUrls: entry.mediaUrls,
            mediaType: entry.mediaType,
            savedAt: entry.savedAt ? new Date(entry.savedAt) : new Date(),
            raw: {
              kind: `${source}-sync`,
              capturedAt: new Date().toISOString(),
              ...(entry.meta ? { [source]: entry.meta } : {}),
            },
          });
        } catch (err) {
          log.warn(
            `[pond sync:${source}] per-item failure`,
            entry.sourceId,
            err,
          );
        }
        processed += 1;
        reportProgress();
      }),
    ),
  );
  if (signal.aborted) return;

  // Cap at POOL_SIZE so we never queue inside `leaseWindow`. Sliding
  // window beats fixed batches here — the next item starts as soon as
  // one finishes instead of waiting for the slowest in its batch.
  const harvestLimit = pLimit(POOL_SIZE);
  let sawAuthFailure = false;
  await Promise.all(
    stubEntries.map((entry) =>
      harvestLimit(async () => {
        if (signal.aborted || sawAuthFailure) return;
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
            sawAuthFailure = true;
          }
        } catch (err) {
          log.warn(
            `[pond sync:${source}] per-item failure`,
            entry.sourceId,
            err,
          );
        }
        processed += 1;
        reportProgress();
      }),
    ),
  );

  if (sawAuthFailure) {
    await patchSourceSync(source, { lastError: "auth_required" });
    emit({
      source,
      state: "auth_required",
      message: `Lost ${source} session — please re-connect.`,
      lastError: "auth_required",
    });
    return;
  }
  if (signal.aborted) return;

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

// Per-run safety cap. Twitter virtualises the bookmarks list so memory
// stays bounded; the limit is purely so a runaway page can't pin the
// scroll forever. 5k comfortably covers any user we've seen.
const TWITTER_MAX_ITEMS = 5_000;

/**
 * Map a `BookmarksEntry` (rich GraphQL data + DOM fallback) into the
 * exact `RawTwitter` shape the renderer's `mergeTwitter` expects, so
 * the metric chips (likes / reposts / replies / bookmarks / views)
 * actually render. Without this re-shape the renderer reads
 * `raw.twitter.metrics.likes` from a verbatim API blob whose likes
 * live at `legacy.favorite_count`, and every chip silently disappears.
 *
 * The verbatim API tweet is preserved on `__verbatim` (open extension
 * point on `RawSaveMetadata`) for future code that wants the raw bag.
 */
function buildRawForBookmark(entry: BookmarksEntry): {
  capturedAt: string;
  twitter: RawTwitter;
  __verbatim?: unknown;
} {
  const capturedAt = new Date().toISOString();
  const twitter: RawTwitter = {};
  if (entry.bookmarkedAt) twitter.bookmarkedAt = entry.bookmarkedAt;

  const r = entry.rich;
  if (!r) return { capturedAt, twitter };

  if (r.author.name) twitter.authorName = r.author.name;
  if (r.author.handle) twitter.authorUrl = `https://x.com/${r.author.handle}`;

  twitter.metrics = {
    likes: r.metrics.likes,
    retweets: r.metrics.retweets,
    replies: r.metrics.replies,
    views: r.metrics.views,
    bookmarks: r.metrics.bookmarks,
  };

  if (r.media.length > 0) {
    const media: TwitterMediaItem[] = r.media.map((m) => ({
      url: m.url,
      type: m.type === "video" ? "video" : "image",
      poster: m.poster,
    }));
    twitter.media = media;
  }

  if (r.quoted) {
    twitter.isQuote = true;
    twitter.quotedTweet = {
      tweetId: r.quoted.tweetId,
      author: r.quoted.author.handle
        ? `@${r.quoted.author.handle}`
        : r.quoted.author.name || undefined,
      authorName: r.quoted.author.name || undefined,
      text: r.quoted.fullText || undefined,
      url: r.quoted.url,
    };
  }

  return { capturedAt, twitter, __verbatim: r.raw };
}

async function syncTwitter(signal: AbortSignal): Promise<void> {
  const source: Source = "twitter";

  // Read every existing twitter sourceId so the harvester can keep its
  // dedupe set warm against virtualised re-renders, and so we can
  // filter known ids out before ingesting.
  const db = await getDb();
  const knownRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(eq(saves.source, source));
  const knownIds = new Set<string>(knownRows.map((r) => r.sourceId));
  log.info(
    `[pond sync:twitter] starting; ${knownIds.size} tweets already in library`,
  );
  emit({
    source,
    state: "running",
    message: `Looking at your Twitter bookmarks…`,
  });

  // Scroll the bookmarks list. Entries are read directly from the
  // rendered DOM cards — id, url, author, snippet text, cover image —
  // no per-tweet network fetches, no rate-limit surface.
  //
  // The harvester polls its in-page state and reports back via
  // `onProgress` so the toast can move from "Looking at your Twitter
  // bookmarks…" → "Found 23 bookmarks…" as the scroll loop walks the
  // virtualised list. A big library otherwise sits silent for minutes.
  const harvest = await harvestTwitterBookmarks(
    {
      knownIds: Array.from(knownIds),
      maxItems: TWITTER_MAX_ITEMS,
    },
    {
      onProgress: (p) => {
        if (signal.aborted) return;
        const message =
          p.phase === "hydrate"
            ? "Loading your Twitter bookmarks…"
            : p.fresh > 0
              ? `Found ${p.fresh} new bookmark${p.fresh === 1 ? "" : "s"}…`
              : `Scanned ${p.seen} bookmark${p.seen === 1 ? "" : "s"}…`;
        emit({ source, state: "running", message });
      },
    },
  );
  if (signal.aborted) return;

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      log.info("[pond sync:twitter] auth wall");
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: "Sign in to Twitter to enable background sync.",
        lastError: "auth_required",
      });
      return;
    }
    // `no_match` and `timeout` are soft failures — leave `lastSyncedAt`
    // untouched so the next cron tick retries from a clean slate.
    log.warn("[pond sync:twitter] harvest failed", harvest.reason);
    await patchSourceSync(source, { lastError: harvest.reason });
    emit({
      source,
      state: "error",
      message: `Couldn't read bookmarks: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    return;
  }

  const fresh = harvest.entries.filter((e) => !knownIds.has(e.tweetId));

  if (fresh.length === 0) {
    log.info("[pond sync:twitter] nothing new");
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

  log.info(`[pond sync:twitter] importing ${fresh.length} new bookmarks`);
  emit({
    source,
    state: "running",
    message: `Importing 0 of ${fresh.length} bookmarks…`,
    progress: { current: 0, total: fresh.length },
  });

  // Each entry already carries everything `ingestFromHttp` needs from
  // the rendered card. No network here, so the loop is fast. Per-entry
  // failures are swallowed; a single bad row shouldn't fail the run.
  let processed = 0;
  let imported = 0;
  for (const entry of fresh) {
    if (signal.aborted) {
      log.info("[pond sync:twitter] aborted by user");
      return;
    }
    try {
      await ingestFromHttp({
        source,
        sourceId: entry.tweetId,
        url: entry.url,
        title: entry.title,
        description: entry.description,
        author: entry.author,
        mediaUrl: entry.mediaUrl,
        mediaUrls: entry.mediaUrls,
        // `savedAt` is the user-interaction timestamp. The card's
        // `<time datetime>` is the original tweet time, not the
        // bookmark time — Twitter doesn't expose the latter in the
        // rendered DOM. Use it when present; fall back to ingest time.
        savedAt: entry.bookmarkedAt ? new Date(entry.bookmarkedAt) : new Date(),
        // `raw.twitter` MUST be a `RawTwitter` blob (the renderer's
        // `mergeTwitter` reads `raw.twitter.metrics.likes` etc.). The
        // verbatim API tweet would shape-mismatch and silently strip
        // every metric chip from the UI, so build a typed
        // `RawTwitter` here from the parsed `RichTweet`. The verbatim
        // API tweet still gets stashed under `__verbatim` for future
        // code that wants the unfiltered payload.
        raw: { kind: "twitter-sync", ...buildRawForBookmark(entry) },
      });
      imported += 1;
    } catch (err) {
      log.warn(
        "[pond sync:twitter] per-tweet ingest failure",
        entry.tweetId,
        err,
      );
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
  await patchSourceSync(source, { lastSyncedAt, lastError: null });
  log.info(`[pond sync:twitter] done; imported ${imported}`);
  emit({
    source,
    state: "done",
    message: `Imported ${imported} bookmark${imported === 1 ? "" : "s"}.`,
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

/**
 * A list entry counts as "rich" when the card DOM gave us at least a
 * title or a media URL — enough to create a useful save row without
 * burning a per-item hidden-window page load.
 */
function entryHasRichData(entry: ListEntry): boolean {
  return Boolean(entry.title || entry.mediaUrl);
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
