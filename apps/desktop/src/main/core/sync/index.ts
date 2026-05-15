import {
  DEFAULT_GLOBAL_SYNC_PREFS,
  DEFAULT_SOURCE_SYNC_PREFS,
  type GlobalSyncPrefs,
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
  isSourceConnected,
  POOL_SIZE,
} from "../refresh/scrape-window";
import { isSyncBlockedByStorageGuard } from "../storage-watcher";

export interface SyncOptions {
  trigger?: "manual" | "cron";
}

export interface SyncStatusUpdate {
  source: Source;
  state: "idle" | "running" | "done" | "error" | "auth_required";
  message?: string;
  progress?: { current: number; total: number };
  lastSyncedAt?: string | null;
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

export async function getSourceSync(source: Source): Promise<SourceSyncPrefs> {
  const prefs = await getPrefs();
  return { ...DEFAULT_SOURCE_SYNC_PREFS, ...prefs.sync.sources[source] };
}

export async function patchSourceSync(
  source: Source,
  patch: Partial<SourceSyncPrefs>,
): Promise<SourceSyncPrefs> {
  const prefs = await getPrefs();
  const next: SourceSyncPrefs = {
    ...DEFAULT_SOURCE_SYNC_PREFS,
    ...prefs.sync.sources[source],
    ...patch,
  };
  await setPrefs({
    sync: { sources: { ...prefs.sync.sources, [source]: next } },
  });
  return next;
}

export async function getGlobalSync(): Promise<GlobalSyncPrefs> {
  const prefs = await getPrefs();
  return { ...DEFAULT_GLOBAL_SYNC_PREFS, ...prefs.sync.global };
}

export async function patchGlobalSync(
  patch: Partial<GlobalSyncPrefs>,
): Promise<GlobalSyncPrefs> {
  const prefs = await getPrefs();
  const next: GlobalSyncPrefs = {
    ...DEFAULT_GLOBAL_SYNC_PREFS,
    ...prefs.sync.global,
    ...patch,
  };
  await setPrefs({ sync: { global: next } });
  return next;
}

export async function syncAllSources(opts: SyncOptions = {}): Promise<void> {
  for (const source of SYNCABLE_SOURCES) {
    const connected = await isSourceConnected(source).catch(() => false);
    if (!connected) continue;
    try {
      await syncSource(source, opts);
    } catch (err) {
      log.warn("[pond sync] syncSource threw", source, err);
    }
  }
}

const SYNCABLE_SOURCES: readonly Source[] = [
  "twitter",
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "tiktok",
];

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

export function cancelSync(source: Source): void {
  const c = inFlight.get(source);
  if (c) c.abort();
}

export function isSyncing(source: Source): boolean {
  return inFlight.has(source);
}

export const LIST_HARVEST_SOURCES = new Set<Source>([
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "tiktok",
]);

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
      case "arena":
        return segs[0] ?? null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

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
  if (source === "cosmos" || source === "arena") {
    const prefs = await getPrefs();
    const stored = prefs.sync.handles?.[source]?.trim().replace(/^@/, "");
    accountKey = stored || (await inferAccountKey(source)) || undefined;
    if (!accountKey) {
      log.info(`[pond sync:${source}] no handle configured`);
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Add your ${source} handle in Connected Apps to enable sync.`,
        lastError: "auth_required",
      });
      return;
    }
  } else if (source === "tiktok") {
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
  } else if (source === "pinterest") {
    // Pinterest reads the logged-in user's pins from /me/pins/, so the URL is
    // independent of any handle. Pass a sentinel so listUrlForSource resolves.
    accountKey = (await inferAccountKey(source)) || "me";
  }

  const harvest = await harvestSourceList(
    source,
    {
      knownIds: Array.from(knownIds),
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
      log.info(`[pond sync:${source}] auth wall`);
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Sign in to ${source} to enable background sync.`,
        lastError: "auth_required",
      });
      return;
    }
    log.warn(`[pond sync:${source}] harvest failed`, harvest.reason);
    await patchSourceSync(source, { lastError: harvest.reason });
    emit({
      source,
      state: "error",
      message: `Couldn't read list: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    return;
  }

  const combined = harvest.entries;
  if (source === "youtube") {
    const liked = await harvestYoutubeLikedList({
      knownIds: Array.from(knownIds),
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
    log.info(
      `[pond sync:${source}] nothing new (scanned ${combined.length} items)`,
    );
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
    log.info(`[pond sync:${source}] auth wall mid-run`);
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

  log.info(`[pond sync:${source}] done; imported ${processed}`);
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

  const harvest = await harvestTwitterBookmarks(
    {
      knownIds: Array.from(knownIds),
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
        savedAt: entry.bookmarkedAt ? new Date(entry.bookmarkedAt) : new Date(),
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

export async function countSavesForSource(source: Source): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: saves.id })
    .from(saves)
    .where(eq(saves.source, source));
  return rows.length;
}

function entryHasRichData(entry: ListEntry): boolean {
  return Boolean(entry.title || entry.mediaUrl);
}

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
