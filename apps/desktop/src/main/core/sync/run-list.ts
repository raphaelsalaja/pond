import type { ConnectedAccount, Source } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { sourceLabel } from "@pond/schema/sources";
import log from "electron-log/main.js";
import {
  accountImportScope,
  savedSinceStart,
} from "../../../shared/import-scope";
import { type EnqueueItem, enqueue } from "../pipeline/enqueue";
import {
  dropMissingListKind,
  mergeListKindsOntoExisting,
} from "../pipeline/list-kinds";
import { createQueueGeneration } from "../pipeline/queue-generations";
import type { ListHarvestResult } from "../refresh/harvest/list-types";
import { harvestSubstackSubscriptions } from "../refresh/harvest/substack/api";
import {
  harvestInstagramLikedList,
  harvestSourceCollections,
  harvestSourceList,
  harvestYoutubeLikedList,
  listSourceCollections,
} from "../refresh/harvest-window";
import { resolveAccountHandle } from "./account-key";
import { getAccountSync, partitionForAccount } from "./accounts";
import { fileIntoFolders } from "./collection-folders";
import { NO_COLLECTION_PASS, walkEveryCollection } from "./every-collection";
import {
  defaultListKind,
  mergeEntryListKinds,
  stampListKind,
  unionById,
} from "./harvest-union";
import {
  COMBINED_LISTS,
  collectionCheckDue,
  listHarvestPlan,
  subscriptionCheck,
} from "./import-scope";
import { organizeIncoming } from "./incoming";
import {
  loadAllKnownIds,
  loadSyncBaseline,
  patchAccountSync,
  persistWatermark,
} from "./sync-baseline";
import { emit, listGapNote } from "./sync-status";

/** Caps one subscriptions pass so a busy week of feeds can't flood the library. */
const SUBSCRIPTION_POSTS_PER_RUN = 50;

export const LIST_HARVEST_SOURCES = new Set<Source>([
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "tiktok",
  "reddit",
  "github",
  "substack",
  "tumblr",
  "savee",
  "behance",
  "vimeo",
  "dribbble",
  "unsplash",
  "bluesky",
  "marked",
]);

export async function syncListSource(
  account: ConnectedAccount,
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
  forceFull = false,
): Promise<void> {
  const { source } = account;
  const accountId = account.id;
  const partition = partitionForAccount(accountId);
  const baseline = await loadSyncBaseline(account, forceFull);
  const knownIds = baseline.knownIds;
  await patchAccountSync(accountId, { knownCount: baseline.total });
  log.info(
    `[pond sync:${source}] starting for @${account.handle ?? accountId}; ${baseline.total} items already in library (${baseline.full ? "full" : `incremental, ${knownIds.size}-id window`})`,
  );
  emit({
    accountId,
    source,
    state: "running",
    message: "Reading",
  });

  let accountKey: string | undefined;
  if (
    source === "arena" ||
    source === "tiktok" ||
    source === "reddit" ||
    source === "github" ||
    source === "dribbble" ||
    source === "bluesky"
  ) {
    /** A handle Source has no session to probe; its Account was keyed by DID when you connected. */
    accountKey =
      source === "bluesky"
        ? (account.identityKey ?? undefined)
        : ((await resolveAccountHandle(account)) ?? undefined);
    if (!accountKey) {
      log.info(`[pond sync:${source}] could not resolve account from session`);
      await patchAccountSync(accountId, { lastError: "auth_required" });
      emit({
        accountId,
        source,
        state: "auth_required",
        message:
          source === "bluesky"
            ? "Connect Bluesky with your handle to enable background sync."
            : `Sign in to ${source} to enable background sync.`,
        lastError: "auth_required",
      });
      return;
    }
  } else if (source === "pinterest") {
    accountKey = (await resolveAccountHandle(account)) ?? "me";
  } else if (source === "cosmos") {
    accountKey = (await resolveAccountHandle(account)) ?? undefined;
  }

  const scope = accountImportScope(source, account.sync);
  const plan = listHarvestPlan(source, scope);
  const accountSync = await getAccountSync(accountId);
  const { resumeCursor } = accountSync;
  const resuming = plan.primary && baseline.full && Boolean(resumeCursor);
  if (resuming) {
    log.info(
      `[pond sync:${source}] continuing the list where the last run stopped`,
    );
  }
  const checkCollections = collectionCheckDue(plan, accountSync, baseline.full);
  /** Reading picked collections to the end reaches saves older than the recent window, which must count as known. */
  if (checkCollections && plan.collections && !baseline.full) {
    for (const id of await loadAllKnownIds(account)) knownIds.add(id);
  }
  const collectionEarlyStop = !(baseline.full || checkCollections);
  const listArgs: Parameters<typeof harvestSourceList>[1] = {
    knownIds: Array.from(knownIds),
    earlyStop: !baseline.full,
    accountKey,
  };
  if (resuming && resumeCursor) listArgs.resumeCursor = resumeCursor;
  if (plan.listKinds.length > 0) listArgs.listKinds = plan.listKinds;
  const savedSince = savedSinceStart(source, scope);
  if (savedSince) listArgs.savedSince = savedSince.toISOString();
  const harvest: ListHarvestResult = plan.collections
    ? await harvestSourceCollections(
        source,
        plan.collections,
        { ...listArgs, earlyStop: collectionEarlyStop },
        { partition },
      )
    : plan.primary
      ? await harvestSourceList(source, listArgs, {
          partition,
          onProgress: () => {
            emit({
              accountId,
              source,
              state: "running",
              message: "Scanning",
            });
          },
        })
      : { ok: true, entries: [], reachedEnd: true };
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
        message: `Sign in to ${source} to enable background sync.`,
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
          ? `${sourceLabel(source)} asked us to slow down. Paused ~${waitMin} min to protect your account.`
          : `${sourceLabel(source)} asked us to slow down. Paused to protect your account.`,
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
      message: `Couldn't read list: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    ev.outcome = "error";
    ev.error = { name: "HarvestError", message: harvest.reason };
    return;
  }

  const gaps: string[] = [];
  const dualHarvest = COMBINED_LISTS.has(source);
  let combined =
    dualHarvest && !plan.collections
      ? harvest.entries
      : defaultListKind(harvest.entries, "saved");
  if (dualHarvest && plan.collections && plan.primary) {
    const rest = await harvestSourceList(source, listArgs, { partition });
    if (rest.ok) {
      combined = unionById(
        combined,
        rest.entries,
        (e) => e.sourceId,
        mergeEntryListKinds,
      );
    } else {
      log.warn(`[pond sync:${source}] likes harvest failed: ${rest.reason}`);
      gaps.push(listGapNote("Likes", rest.reason));
    }
  }
  if (source === "instagram" && plan.liked) {
    const liked = await harvestInstagramLikedList(
      {
        knownIds: Array.from(knownIds),
        earlyStop: !baseline.full,
      },
      { partition },
    );
    if (liked.ok) {
      combined = unionById(
        combined,
        stampListKind(liked.entries, "liked"),
        (e) => e.sourceId,
        mergeEntryListKinds,
      );
    } else {
      log.warn(`[pond sync:instagram] likes harvest failed: ${liked.reason}`);
      gaps.push(listGapNote("Likes", liked.reason));
    }
  }
  if (source === "youtube" && plan.liked) {
    const liked = await harvestYoutubeLikedList(
      {
        knownIds: Array.from(knownIds),
        earlyStop: !baseline.full,
      },
      { partition },
    );
    if (liked.ok) {
      combined = unionById(
        combined,
        stampListKind(liked.entries, "liked"),
        (e) => e.sourceId,
        mergeEntryListKinds,
      );
    } else {
      log.warn(
        `[pond sync:youtube] liked list harvest failed: ${liked.reason}`,
      );
      gaps.push(listGapNote("Liked videos", liked.reason));
    }
  }
  const subscriptions = plan.subscriptions
    ? subscriptionCheck(accountSync)
    : null;
  if (source === "substack" && subscriptions?.due) {
    const checkedAt = new Date().toISOString();
    const posts = await harvestSubstackSubscriptions(
      { since: subscriptions.since, limit: SUBSCRIPTION_POSTS_PER_RUN },
      partition,
    );
    if (posts.ok) {
      combined = unionById(
        combined,
        posts.entries,
        (e) => e.sourceId,
        mergeEntryListKinds,
      );
      await patchAccountSync(accountId, { lastSubscriptionCheckAt: checkedAt });
    } else {
      log.warn(`[pond sync:substack] subscriptions failed: ${posts.reason}`);
      gaps.push(listGapNote("Subscriptions", posts.reason));
    }
  }

  const collectionPass = plan.fileEveryCollection
    ? await walkEveryCollection("Folders", {
        list: () => listSourceCollections(source, { partition, accountKey }),
        walk: (collections) =>
          harvestSourceCollections(
            source,
            collections,
            {
              knownIds: Array.from(knownIds),
              earlyStop: collectionEarlyStop,
              accountKey,
            },
            { partition },
          ),
      })
    : NO_COLLECTION_PASS;
  if (collectionPass.gap) gaps.push(collectionPass.gap);
  const filing = [...combined, ...collectionPass.entries];

  for (const id of await mergeListKindsOntoExisting(source, combined)) {
    knownIds.delete(id);
  }
  if (harvest.complete) {
    const dropped = await dropMissingListKind(
      account,
      "saved",
      new Set(harvest.entries.map((e) => e.sourceId)),
    );
    if (dropped > 0) {
      log.info(`[pond sync:${source}] ${dropped} saves left the list`);
    }
  }

  const allFresh = combined.filter((e) => !knownIds.has(e.sourceId));
  const fresh =
    maxItems && maxItems > 0 ? allFresh.slice(0, maxItems) : allFresh;
  if (maxItems && allFresh.length > fresh.length) {
    log.info(
      `[pond sync:${source}] test cap active. Enqueueing ${fresh.length} of ${allFresh.length} fresh items`,
    );
  }
  /** A capped run leaves harvested items unqueued, so the cursor must not move past them. */
  const nextResumeCursor =
    fresh.length < allFresh.length
      ? undefined
      : harvest.reachedEnd
        ? null
        : (harvest.resumeCursor ?? null);
  ev.harvest = {
    seen: Math.max(harvest.seen ?? 0, combined.length),
    fresh: fresh.length,
    recovery: 0,
  };
  if (fresh.length === 0) {
    await fileIntoFolders(account, filing, collectionPass.collections);
    const lastSyncedAt = await persistWatermark(accountId, {
      full: baseline.full && harvest.reachedEnd,
      newestId: null,
      total: baseline.total,
      resumeCursor: nextResumeCursor,
      collectionsChecked: checkCollections,
    });
    emit({
      accountId,
      source,
      state: "done",
      message: [
        harvest.reachedEnd
          ? "All caught up."
          : "Paused mid-list. Will keep going next sync.",
        ...gaps,
      ].join(" "),
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
    accountId,
    source,
    state: "running",
    message: "Queueing",
    progress: { current: 0, total: fresh.length },
  });

  const generationId = await createQueueGeneration({
    kind: "sync",
    source,
    scope: { accountId, total: fresh.length },
  });
  const bulk = await enqueue(
    fresh.map((entry) => {
      const item: EnqueueItem = { url: entry.url };
      if (entry.listKinds) item.listKinds = entry.listKinds;
      return item;
    }),
    { trigger: `sync:${source}`, accountId, generationId },
  );
  const succeeded = bulk.created + bulk.existing;
  ev.enqueue = { succeeded, failed: bulk.failed };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }
  await fileIntoFolders(account, filing, collectionPass.collections);
  await organizeIncoming(
    bulk.createdIds,
    account.sync.incoming,
    `sync:${source}`,
  );

  const lastSyncedAt = await persistWatermark(accountId, {
    full: baseline.full && harvest.reachedEnd,
    newestId: resuming ? null : (fresh[0]?.sourceId ?? null),
    total: baseline.total + bulk.created,
    resumeCursor: nextResumeCursor,
    collectionsChecked: checkCollections,
  });
  emit({
    accountId,
    source,
    state: "done",
    message: [
      harvest.reachedEnd
        ? `Queued ${succeeded} item${succeeded === 1 ? "" : "s"} for ingest.`
        : `Queued ${succeeded} item${succeeded === 1 ? "" : "s"}. More remain for the next sync.`,
      ...gaps,
    ].join(" "),
    progress: { current: fresh.length, total: fresh.length },
    lastSyncedAt,
    lastError: null,
  });
}
