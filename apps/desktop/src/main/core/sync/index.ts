import {
  DEFAULT_GLOBAL_SYNC_PREFS,
  DEFAULT_SOURCE_SYNC_PREFS,
  type GlobalSyncPrefs,
  type Source,
  type SourceSyncPrefs,
  saves,
} from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { and, eq, inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import { getDb } from "../../db";
import { commitEvent, startSyncEvent, toErrorInfo } from "../../lib/wide-event";
import { enqueueSaveByUrl } from "../pipeline/enqueue";
import { getPrefs, setPrefs } from "../prefs";
import {
  harvestSourceList,
  harvestTwitterBookmarks,
  harvestYoutubeLikedList,
  isSourceConnected,
  probeUserHandle,
  readStoredHandle,
} from "../refresh/scrape-window";
import { isSyncBlockedByStorageGuard } from "../storage-watcher";
import { buildTwitterBookmarkSeed } from "./twitter-seed";

export interface SyncOptions {
  trigger?: "manual" | "cron";
  // Caps the number of *new* (not-yet-in-library) items enqueued per source.
  // The list-harvest pass still walks the full list, but only the first
  // `maxItems` fresh entries get queued into the pipeline.
  maxItems?: number;
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

interface InFlight {
  controller: AbortController;
  startedAt: number;
  watchdog: ReturnType<typeof setTimeout>;
}

const inFlight = new Map<Source, InFlight>();

/* If a sync hasn't resolved within this window it's almost certainly
 * stuck — usually `harvestTwitterBookmarks` waiting on a hidden window
 * navigation that never finishes. Abort via the controller so the
 * `finally` clears the slot and the next cron tick can try again
 * instead of being permanently shadowed by a ghost. Twitter has to
 * harvest+enqueue hundreds of bookmarks so it gets the loosest cap. */
const SYNC_WATCHDOG_MS: Record<Source, number> = {
  twitter: 30 * 60_000,
  youtube: 20 * 60_000,
  cosmos: 20 * 60_000,
  arena: 20 * 60_000,
  pinterest: 20 * 60_000,
  instagram: 20 * 60_000,
  tiktok: 20 * 60_000,
};

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
  const existing = inFlight.get(source);
  if (existing) {
    const ageSec = Math.round((Date.now() - existing.startedAt) / 1000);
    log.info(
      `[pond sync] already running (${ageSec}s), ignoring ${source} (${opts.trigger ?? "manual"})`,
    );
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
  let watchdogTripped = false;
  const watchdog = setTimeout(() => {
    watchdogTripped = true;
    log.warn(
      `[pond sync] watchdog tripped for ${source} after ${Math.round(SYNC_WATCHDOG_MS[source] / 60_000)}m; aborting`,
    );
    controller.abort();
  }, SYNC_WATCHDOG_MS[source]);
  const startedAt = Date.now();
  inFlight.set(source, {
    controller,
    startedAt,
    watchdog,
  });
  /* One wide event per sync run — mutated as the run proceeds and
   * committed unconditionally in the finally. Replaces the trio of
   * "[pond sync:<source>] starting / enqueueing / done" lines that
   * used to drift apart and force you to grep two timestamps to know
   * how long anything took. */
  const ev: SyncRunEvent = startSyncEvent({
    source,
    trigger: opts.trigger ?? "manual",
    outcome: "ok",
  });
  emit({ source, state: "running", message: "Starting…" });
  try {
    if (source === "twitter") {
      await syncTwitter(controller.signal, ev, opts.maxItems);
    } else if (LIST_HARVEST_SOURCES.has(source)) {
      await syncListSource(source, controller.signal, ev, opts.maxItems);
    } else {
      await patchSourceSync(source, { lastError: "unsupported" });
      emit({
        source,
        state: "error",
        message: "This source doesn't support background sync yet.",
        lastError: "unsupported",
      });
      ev.outcome = "error";
      ev.error = { name: "Unsupported", message: "source has no sync runner" };
      return;
    }
    if (controller.signal.aborted) ev.outcome = "aborted";
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
    ev.outcome = "error";
    ev.error = toErrorInfo(err);
  } finally {
    const entry = inFlight.get(source);
    if (entry) clearTimeout(entry.watchdog);
    inFlight.delete(source);
    ev.durationMs = Date.now() - startedAt;
    ev.lockHeldMs = ev.durationMs;
    ev.watchdogTripped = watchdogTripped;
    if (watchdogTripped) ev.outcome = "aborted";
    void commitEvent(ev);
  }
}

export function cancelSync(source: Source): void {
  const entry = inFlight.get(source);
  if (entry) entry.controller.abort();
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

// Resolve the logged-in user's handle for sites where the list URL is
// `/<handle>` (cosmos, arena). Cache → DB inference → hidden-window
// probe → cache. The probe is the slow path; we only hit it the first
// time after the user pushes their session.
async function resolveAccountKey(source: Source): Promise<string | null> {
  const cached = await readStoredHandle(source);
  if (cached) return cached;

  const inferred = await inferAccountKey(source);
  if (inferred) {
    await persistAccountKey(source, inferred);
    return inferred;
  }

  log.info(`[pond sync:${source}] probing hidden window for handle`);
  const probed = await probeUserHandle(source);
  if (probed) {
    log.info(`[pond sync:${source}] probed handle`, probed);
    await persistAccountKey(source, probed);
    return probed;
  }
  return null;
}

async function persistAccountKey(
  source: Source,
  handle: string,
): Promise<void> {
  try {
    const prefs = await getPrefs();
    const nextHandles = { ...(prefs.sync.handles ?? {}), [source]: handle };
    await setPrefs({ sync: { handles: nextHandles } });
  } catch (err) {
    log.warn(`[pond sync:${source}] failed to cache handle`, err);
  }
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

const ENQUEUE_CONCURRENCY = 8;

async function syncListSource(
  source: Source,
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
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
    accountKey = (await resolveAccountKey(source)) ?? undefined;
    if (!accountKey) {
      log.info(`[pond sync:${source}] could not resolve account from session`);
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Sign in to ${source} to enable background sync.`,
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
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: `Sign in to ${source} to enable background sync.`,
        lastError: "auth_required",
      });
      ev.outcome = "auth_required";
      return;
    }
    await patchSourceSync(source, { lastError: harvest.reason });
    emit({
      source,
      state: "error",
      message: `Couldn't read list: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    ev.outcome = "error";
    ev.error = { name: "HarvestError", message: harvest.reason };
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

  const allFresh = combined.filter((e) => !knownIds.has(e.sourceId));
  const fresh =
    maxItems && maxItems > 0 ? allFresh.slice(0, maxItems) : allFresh;
  if (maxItems && allFresh.length > fresh.length) {
    log.info(
      `[pond sync:${source}] test cap active — enqueueing ${fresh.length} of ${allFresh.length} fresh items`,
    );
  }
  ev.harvest = {
    seen: combined.length,
    fresh: fresh.length,
    recovery: 0,
  };
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
    ev.outcome = "noop";
    ev.enqueue = { succeeded: 0, failed: 0 };
    return;
  }

  log.info(
    `[pond sync:${source}] enqueueing ${fresh.length} new URLs into pipeline`,
  );
  emit({
    source,
    state: "running",
    message: `Queueing 0 of ${fresh.length}…`,
    progress: { current: 0, total: fresh.length },
  });

  let processed = 0;
  let enqueueFailed = 0;
  const limit = pLimit(ENQUEUE_CONCURRENCY);
  await Promise.all(
    fresh.map((entry) =>
      limit(async () => {
        if (signal.aborted) return;
        try {
          await enqueueSaveByUrl(entry.url, { trigger: `sync:${source}` });
        } catch (err) {
          log.warn(
            `[pond sync:${source}] enqueue failure`,
            entry.sourceId,
            err,
          );
          enqueueFailed += 1;
        }
        processed += 1;
        emit({
          source,
          state: "running",
          message: `Queueing ${processed} of ${fresh.length}…`,
          progress: { current: processed, total: fresh.length },
        });
      }),
    ),
  );
  ev.enqueue = {
    succeeded: Math.max(0, processed - enqueueFailed),
    failed: enqueueFailed,
  };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }

  const lastSyncedAt = new Date().toISOString();
  await patchSourceSync(source, { lastSyncedAt, lastError: null });
  emit({
    source,
    state: "done",
    message: `Queued ${processed} item${processed === 1 ? "" : "s"} for ingest.`,
    progress: { current: processed, total: fresh.length },
    lastSyncedAt,
    lastError: null,
  });
}

async function syncTwitter(
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
): Promise<void> {
  const source: Source = "twitter";
  const db = await getDb();
  const knownRows = await db
    .select({ sourceId: saves.sourceId, status: saves.status })
    .from(saves)
    .where(eq(saves.source, source));
  const knownIds = new Set<string>(knownRows.map((r) => r.sourceId));
  // Tweets we already created a save for but whose pipeline blew up
  // (typically: harvest_metadata returned `scrape returned no data` after
  // X.com rate-limited the partition). When the same tweet shows up in
  // the bookmark capture again we can lift it back out of `failed` and
  // reseed its row from the GraphQL data we already have, instead of
  // letting it sit dead forever.
  const failedSourceIds = new Set<string>(
    knownRows.filter((r) => r.status === "failed").map((r) => r.sourceId),
  );
  log.info(
    `[pond sync:twitter] starting; ${knownIds.size} tweets already in library (${failedSourceIds.size} failed)`,
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
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      await patchSourceSync(source, { lastError: "auth_required" });
      emit({
        source,
        state: "auth_required",
        message: "Sign in to Twitter to enable background sync.",
        lastError: "auth_required",
      });
      ev.outcome = "auth_required";
      return;
    }
    await patchSourceSync(source, { lastError: harvest.reason });
    emit({
      source,
      state: "error",
      message: `Couldn't read bookmarks: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    ev.outcome = "error";
    ev.error = { name: "HarvestError", message: harvest.reason };
    return;
  }

  // Two batches:
  //   `fresh`     — tweets we haven't seen yet (creates new saves).
  //   `recovery`  — tweets we have but in `failed` status; seeding lets
  //                 the pipeline restart with metadata already populated.
  const allFresh = harvest.entries.filter((e) => !knownIds.has(e.tweetId));
  const recovery = harvest.entries.filter((e) =>
    failedSourceIds.has(e.tweetId),
  );
  const fresh =
    maxItems && maxItems > 0 ? allFresh.slice(0, maxItems) : allFresh;
  if (maxItems && allFresh.length > fresh.length) {
    log.info(
      `[pond sync:twitter] test cap active — enqueueing ${fresh.length} of ${allFresh.length} fresh bookmarks`,
    );
  }
  const total = fresh.length + recovery.length;
  ev.harvest = {
    seen: harvest.entries.length,
    fresh: fresh.length,
    recovery: recovery.length,
  };
  if (total === 0) {
    const lastSyncedAt = new Date().toISOString();
    await patchSourceSync(source, { lastSyncedAt, lastError: null });
    emit({
      source,
      state: "done",
      message: "All caught up.",
      lastSyncedAt,
      lastError: null,
    });
    ev.outcome = "noop";
    ev.enqueue = { succeeded: 0, failed: 0 };
    return;
  }

  log.info(
    `[pond sync:twitter] enqueueing ${fresh.length} new + ${recovery.length} recover`,
  );
  emit({
    source,
    state: "running",
    message:
      recovery.length > 0
        ? `Queueing 0 of ${total} (${recovery.length} recovering)…`
        : `Queueing 0 of ${total} bookmarks…`,
    progress: { current: 0, total },
  });

  let processed = 0;
  let enqueueFailed = 0;
  const limit = pLimit(ENQUEUE_CONCURRENCY);
  const queue = [...fresh, ...recovery];
  await Promise.all(
    queue.map((entry) =>
      limit(async () => {
        if (signal.aborted) return;
        try {
          const seed = buildTwitterBookmarkSeed(entry) ?? undefined;
          await enqueueSaveByUrl(entry.url, {
            trigger: "sync:twitter",
            seed,
          });
        } catch (err) {
          log.warn("[pond sync:twitter] enqueue failure", entry.tweetId, err);
          enqueueFailed += 1;
        }
        processed += 1;
        emit({
          source,
          state: "running",
          message: `Queueing ${processed} of ${total} bookmarks…`,
          progress: { current: processed, total },
        });
      }),
    ),
  );
  ev.enqueue = {
    succeeded: Math.max(0, processed - enqueueFailed),
    failed: enqueueFailed,
  };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }

  const lastSyncedAt = new Date().toISOString();
  await patchSourceSync(source, { lastSyncedAt, lastError: null });
  emit({
    source,
    state: "done",
    message:
      recovery.length > 0
        ? `Queued ${fresh.length} new + recovered ${recovery.length} failed.`
        : `Queued ${processed} bookmark${processed === 1 ? "" : "s"} for ingest.`,
    progress: { current: processed, total },
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
