import { type ConnectedAccount, type Source, saves } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { accountImportScope } from "../../../shared/import-scope";
import { getDb } from "../../db";
import { type EnqueueItem, enqueue } from "../pipeline/enqueue";
import { mergeListKindsOntoExisting } from "../pipeline/list-kinds";
import { createQueueGeneration } from "../pipeline/queue-generations";
import { addCollectionEntry } from "../refresh/harvest/collection-entries";
import type {
  BookmarksHarvestArgs,
  BookmarksHarvestResult,
} from "../refresh/harvest/twitter";
import {
  harvestTwitterBookmarkFolder,
  harvestTwitterBookmarks,
  harvestTwitterLikes,
} from "../refresh/harvest-window";
import { partitionForAccount } from "./accounts";
import { fileIntoFolders } from "./collection-folders";
import { mergeEntryListKinds, stampListKind, unionById } from "./harvest-union";
import { listHarvestPlan } from "./import-scope";
import {
  loadSyncBaseline,
  patchAccountSync,
  persistWatermark,
} from "./sync-baseline";
import { emit, listGapNote } from "./sync-status";
import { harvestConfiguredTwitterLikes } from "./twitter-likes";
import { buildTwitterBookmarkSeed } from "./twitter-seed";

export async function syncTwitter(
  account: ConnectedAccount,
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
  forceFull = false,
): Promise<void> {
  const source: Source = "twitter";
  const accountId = account.id;
  const db = await getDb();
  const baseline = await loadSyncBaseline(account, forceFull);
  const knownIds = baseline.knownIds;
  await patchAccountSync(accountId, { knownCount: baseline.total });
  const failedRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(and(eq(saves.source, source), eq(saves.status, "failed")));
  const failedSourceIds = new Set<string>(failedRows.map((r) => r.sourceId));
  log.info(
    `[pond sync:twitter] starting for @${account.handle ?? accountId}; ${baseline.total} tweets already in library (${failedSourceIds.size} failed, ${baseline.full ? "full" : `incremental ${knownIds.size}-id window`})`,
  );
  emit({
    accountId,
    source,
    state: "running",
    message: "Reading",
  });

  const plan = listHarvestPlan(
    source,
    accountImportScope(source, account.sync),
  );
  const bookmarkArgs = {
    knownIds: baseline.full ? [] : Array.from(knownIds),
  };
  const harvestOpts = {
    partition: partitionForAccount(accountId),
    onProgress: (p: { phase: "hydrate" | "scroll"; fresh: number }) => {
      if (signal.aborted) return;
      const message =
        p.phase === "hydrate" ? "Loading" : p.fresh > 0 ? "Found" : "Scanning";
      emit({ accountId, source, state: "running", message });
    },
  };
  const harvest: BookmarksHarvestResult = plan.collections
    ? await harvestFolders(plan.collections, bookmarkArgs, harvestOpts)
    : plan.primary
      ? await harvestTwitterBookmarks(bookmarkArgs, harvestOpts)
      : { ok: true, entries: [], captures: [], reachedEnd: true };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }

  if (!harvest.ok) {
    if (harvest.reason === "auth_required") {
      await patchAccountSync(accountId, { lastError: "auth_required" });
      emit({
        accountId,
        source,
        state: "auth_required",
        message: "Sign in to Twitter to enable background sync.",
        lastError: "auth_required",
      });
      ev.outcome = "auth_required";
      return;
    }
    if (harvest.reason === "rate_limited") {
      const waitMin = harvest.retryAfterSec
        ? Math.max(1, Math.round(harvest.retryAfterSec / 60))
        : null;
      await patchAccountSync(accountId, { lastError: "rate_limited" });
      emit({
        accountId,
        source,
        state: "paused",
        message: waitMin
          ? `Twitter asked us to slow down. Paused ~${waitMin} min to protect your account.`
          : "Twitter asked us to slow down. Paused to protect your account.",
        lastError: "rate_limited",
      });
      ev.outcome = "rate_limited";
      return;
    }
    await patchAccountSync(accountId, { lastError: harvest.reason });
    emit({
      accountId,
      source,
      state: "error",
      message: `Couldn't read bookmarks: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    ev.outcome = "error";
    ev.error = { name: "HarvestError", message: harvest.reason };
    return;
  }

  const likes = await harvestConfiguredTwitterLikes(
    account,
    {
      aborted: signal.aborted,
      knownIds: baseline.full ? [] : Array.from(knownIds),
      partition: partitionForAccount(accountId),
    },
    { harvestTwitterLikes },
  );
  const gaps: string[] = [];
  if (likes && !likes.ok) {
    log.warn(`[pond sync:twitter] likes harvest failed: ${likes.reason}`);
    gaps.push(listGapNote("Likes", likes.reason));
  }
  const liked = likes?.ok ? likes : null;
  const entries = liked
    ? unionById(
        stampListKind(harvest.entries, "saved"),
        stampListKind(liked.entries, "liked"),
        (e) => e.tweetId,
        mergeEntryListKinds,
      )
    : stampListKind(harvest.entries, "saved");

  await mergeListKindsOntoExisting(
    source,
    entries.map((e) => ({
      sourceId: e.tweetId,
      listKinds: e.listKinds,
    })),
  );

  const allFresh = entries.filter((e) => !knownIds.has(e.tweetId));
  const recovery = entries.filter((e) => failedSourceIds.has(e.tweetId));
  const fresh =
    maxItems && maxItems > 0 ? allFresh.slice(0, maxItems) : allFresh;
  if (maxItems && allFresh.length > fresh.length) {
    log.info(
      `[pond sync:twitter] test cap active. Enqueueing ${fresh.length} of ${allFresh.length} fresh bookmarks`,
    );
  }
  const total = fresh.length + recovery.length;
  ev.harvest = {
    seen: entries.length,
    fresh: fresh.length,
    recovery: recovery.length,
  };
  const filing = entries.map((e) => ({
    sourceId: e.tweetId,
    collectionIds: e.collectionIds,
  }));
  if (total === 0) {
    await fileIntoFolders(account, filing);
    const lastSyncedAt = await persistWatermark(accountId, {
      full: baseline.full,
      newestId: null,
      total: baseline.total,
    });
    emit({
      accountId,
      source,
      state: "done",
      message: ["All caught up.", ...gaps].join(" "),
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
    accountId,
    source,
    state: "running",
    message: "Queueing",
    progress: { current: 0, total },
  });

  const queue = [...fresh, ...recovery];
  const generationId = await createQueueGeneration({
    kind: "sync",
    source,
    scope: { accountId, total: queue.length },
  });
  const bulk = await enqueue(
    queue.map((entry) => {
      const item: EnqueueItem = { url: entry.url };
      const seed = buildTwitterBookmarkSeed(entry);
      if (seed) item.seed = seed;
      if (entry.listKinds) item.listKinds = entry.listKinds;
      return item;
    }),
    { trigger: "sync:twitter", accountId, generationId },
  );
  const succeeded = bulk.created + bulk.existing;
  ev.enqueue = { succeeded, failed: bulk.failed };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }
  await fileIntoFolders(account, filing);

  const lastSyncedAt = await persistWatermark(accountId, {
    full: baseline.full,
    newestId: fresh[0]?.tweetId ?? null,
    total: baseline.total + bulk.created,
  });
  emit({
    accountId,
    source,
    state: "done",
    message: [
      recovery.length > 0
        ? `Queued ${fresh.length} new + recovered ${recovery.length} failed.`
        : `Queued ${succeeded} bookmark${succeeded === 1 ? "" : "s"} for ingest.`,
      ...gaps,
    ].join(" "),
    progress: { current: total, total },
    lastSyncedAt,
    lastError: null,
  });
}

/** Walks folders one at a time; a missing folder is skipped, while a sign-out or rate limit stops the run. */
async function harvestFolders(
  folders: readonly { id: string }[],
  args: BookmarksHarvestArgs,
  opts: Parameters<typeof harvestTwitterBookmarkFolder>[2],
): Promise<BookmarksHarvestResult> {
  const entries = new Map<
    string,
    Extract<BookmarksHarvestResult, { ok: true }>["entries"][number]
  >();
  const captures: Extract<BookmarksHarvestResult, { ok: true }>["captures"] =
    [];
  let reachedEnd = true;
  let failed: Extract<BookmarksHarvestResult, { ok: false }> | null = null;
  for (const folder of folders) {
    const result = await harvestTwitterBookmarkFolder(folder.id, args, opts);
    if (!result.ok) {
      if (
        result.reason === "auth_required" ||
        result.reason === "rate_limited"
      ) {
        return result;
      }
      log.warn(
        `[pond sync:twitter] bookmark folder ${folder.id} failed: ${result.reason}`,
      );
      failed = result;
      reachedEnd = false;
      continue;
    }
    for (const entry of result.entries) {
      addCollectionEntry(entries, entry.tweetId, entry, folder.id);
    }
    captures.push(...result.captures);
    reachedEnd &&= result.reachedEnd;
  }
  if (failed && entries.size === 0) return failed;
  return { ok: true, entries: [...entries.values()], captures, reachedEnd };
}
