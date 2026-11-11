import { type ConnectedAccount, type Source, saves } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { accountImportScope } from "../../../shared/import-scope";
import { getDb } from "../../db";
import { type EnqueueItem, enqueue } from "../pipeline/enqueue";
import { mergeListKindsOntoExisting } from "../pipeline/list-kinds";
import { createQueueGeneration } from "../pipeline/queue-generations";
import type { ThreadsListKind } from "../refresh/harvest/threads/list";
import { harvestThreadsList } from "../refresh/harvest-window";
import { partitionForAccount } from "./accounts";
import { listHarvestPlan } from "./import-scope";
import { fileIncomingSaves } from "./incoming";
import {
  loadSyncBaseline,
  patchAccountSync,
  persistWatermark,
} from "./sync-baseline";
import { emit, listGapNote } from "./sync-status";
import { harvestThreadsLists, threadsListKinds } from "./threads-lists";
import { buildThreadsSavedSeed } from "./threads-seed";

const LIST_NAMES = {
  saved: "saved posts",
  liked: "liked posts",
} satisfies Record<ThreadsListKind, string>;

const GAP_LABELS = {
  saved: "Saved posts",
  liked: "Likes",
} satisfies Record<ThreadsListKind, string>;

export async function syncThreads(
  account: ConnectedAccount,
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
  forceFull = false,
): Promise<void> {
  const source: Source = "threads";
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
    `[pond sync:threads] starting for @${account.handle ?? accountId}; ${baseline.total} posts already in library (${failedSourceIds.size} failed, ${baseline.full ? "full" : `incremental ${knownIds.size}-id window`})`,
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
  const partition = partitionForAccount(accountId);
  const harvest = await harvestThreadsLists(
    threadsListKinds(plan),
    { knownIds: baseline.full ? [] : Array.from(knownIds) },
    (kind, args) =>
      harvestThreadsList(kind, args, {
        partition,
        onProgress: (p) => {
          if (signal.aborted) return;
          const message =
            p.phase === "hydrate"
              ? "Loading"
              : p.fresh > 0
                ? "Found"
                : "Scanning";
          emit({ accountId, source, state: "running", message });
        },
      }),
    signal,
  );
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
        message: "Sign in to Threads to enable background sync.",
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
          ? `Threads asked us to slow down. Paused about ${waitMin} min to protect your account.`
          : "Threads asked us to slow down. Paused to protect your account.",
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
      message: `Couldn't read ${LIST_NAMES[harvest.kind]}: ${harvest.reason}.`,
      lastError: harvest.reason,
    });
    ev.outcome = "error";
    ev.error = { name: "HarvestError", message: harvest.reason };
    return;
  }

  const gaps = harvest.gaps.map((gap) => {
    log.warn(`[pond sync:threads] ${gap.kind} harvest failed: ${gap.reason}`);
    return listGapNote(GAP_LABELS[gap.kind], gap.reason);
  });
  const { entries } = harvest;

  const relisted = await mergeListKindsOntoExisting(
    source,
    entries.map((e) => ({
      sourceId: e.postId,
      listKinds: e.listKinds,
    })),
  );
  for (const id of relisted) knownIds.delete(id);

  const allFresh = entries.filter((e) => !knownIds.has(e.postId));
  const recovery = entries.filter((e) => failedSourceIds.has(e.postId));
  const fresh =
    maxItems && maxItems > 0 ? allFresh.slice(0, maxItems) : allFresh;
  if (maxItems && allFresh.length > fresh.length) {
    log.info(
      `[pond sync:threads] test cap active. Enqueueing ${fresh.length} of ${allFresh.length} fresh posts`,
    );
  }
  const total = fresh.length + recovery.length;
  ev.harvest = {
    seen: entries.length,
    fresh: fresh.length,
    recovery: recovery.length,
  };
  if (total === 0) {
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
    `[pond sync:threads] enqueueing ${fresh.length} new + ${recovery.length} recover`,
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
      const seed = buildThreadsSavedSeed(entry);
      if (seed) item.seed = seed;
      if (entry.listKinds) item.listKinds = entry.listKinds;
      return item;
    }),
    { trigger: "sync:threads", accountId, generationId },
  );
  const succeeded = bulk.created + bulk.existing;
  ev.enqueue = { succeeded, failed: bulk.failed };
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }
  await fileIncomingSaves(
    bulk.createdIds,
    accountId,
    "threads",
    "sync:threads",
  );

  const lastSyncedAt = await persistWatermark(accountId, {
    full: baseline.full,
    newestId: fresh[0]?.postId ?? null,
    total: baseline.total + bulk.created,
  });
  emit({
    accountId,
    source,
    state: "done",
    message: [
      recovery.length > 0
        ? `Queued ${fresh.length} new + recovered ${recovery.length} failed.`
        : `Queued ${succeeded} post${succeeded === 1 ? "" : "s"} for ingest.`,
      ...gaps,
    ].join(" "),
    progress: { current: total, total },
    lastSyncedAt,
    lastError: null,
  });
}
