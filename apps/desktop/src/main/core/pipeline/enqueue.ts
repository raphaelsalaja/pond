import type { Save, Source } from "@pond/schema/db";
import { mergeListKinds } from "@pond/schema/list-kinds";
import log from "electron-log/main.js";
import { broadcastSyncAction } from "../executor";
import { newSaveInboxForTrigger } from "../inbox";
import { persistSave } from "../persist-save";
import type { ImportableCookie } from "../refresh/harvest-window/session";
import { restoreSave } from "../restore-save";
import { listAccounts } from "../sync/accounts";
import { fileIncomingSaves } from "../sync/incoming";
import {
  type EnqueueCandidate,
  type EnqueueItem,
  type EnqueueOptions,
  enqueueCandidateKey,
  normalizeEnqueueItems,
  normalizeUrl,
} from "./enqueue-input";
import {
  createEnqueueBundle,
  openEnqueuePersistence,
  persistMergedListKinds,
} from "./enqueue-persistence";
import {
  promoteInteractiveSaveTasks,
  rependArchiveForCookies,
  resetTasksForSave,
} from "./enqueue-scheduling";
import { classifyUrlToSource } from "./extractors";
import { UnsupportedError } from "./extractors/errors";
import {
  harvestShouldAdoptSave,
  harvestShouldIgnoreSave,
  harvestShouldReseedFailedSave,
  harvestShouldRestoreSave,
} from "./harvest-policy";
import { listKindsFromTrigger } from "./list-kinds";
import { stashPageCookies } from "./page-cookies";
import { isInteractiveTrigger } from "./priority";
import { kickReconciler } from "./reconciler-client";
import {
  applySeedToExistingSave,
  mergeSeedIntoExistingSave,
  persistEnrichment,
  rependFetchAvatar,
} from "./seed";
import { sourceIdFromUrl } from "./url";

export {
  type EnqueueItem,
  type EnqueueOptions,
  normalizeUrl,
} from "./enqueue-input";
export {
  resetTasksForSave,
  retryFailedSaves,
} from "./enqueue-scheduling";

function stashWebCookiesThenKick(
  saveId: string,
  source: Source,
  cookies: ImportableCookie[] | undefined,
): void {
  if (source === "web" && cookies && cookies.length > 0) {
    stashPageCookies(saveId, cookies);
  }
  kickReconciler();
}

async function adoptOrphanedSave(
  current: Pick<Save, "id" | "accountId">,
  opts: EnqueueOptions,
): Promise<void> {
  const { accountId } = opts;
  if (!accountId) return;
  const connected = new Set((await listAccounts()).map((a) => a.id));
  if (
    !harvestShouldAdoptSave(current, accountId, connected, opts.adoptOrphaned)
  )
    return;
  await persistSave(
    current.id,
    { accountId },
    { actorReason: opts.trigger ?? "pipeline:enqueue:adopt" },
  );
  log.info("[pond pipeline:enqueue] adopted save from disconnected account", {
    id: current.id,
    from: current.accountId,
    to: accountId,
  });
}

export interface EnqueueOneResult {
  id: string;
  created: boolean;
  reseeded?: boolean;
  restored?: boolean;
}

export interface EnqueueManyResult {
  created: number;
  existing: number;
  failed: number;
  createdIds: string[];
}

function isItemList(
  input: string | readonly EnqueueItem[],
): input is readonly EnqueueItem[] {
  return Array.isArray(input);
}

export function enqueue(
  url: string,
  opts?: EnqueueOptions,
): Promise<EnqueueOneResult>;
export function enqueue(
  items: readonly EnqueueItem[],
  opts?: EnqueueOptions,
): Promise<EnqueueManyResult>;
export async function enqueue(
  input: string | readonly EnqueueItem[],
  opts: EnqueueOptions = {},
): Promise<EnqueueOneResult | EnqueueManyResult> {
  if (isItemList(input)) return enqueueMany(input, opts);
  return enqueueOne(input, opts);
}

async function enqueueOne(
  rawUrl: string,
  opts: EnqueueOptions = {},
): Promise<EnqueueOneResult> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const classification = classifyUrlToSource(normalizedUrl);
  if (!classification.source) {
    throw new UnsupportedError(`no extractor matches url: ${rawUrl}`);
  }
  const source = classification.source;
  const sourceId = sourceIdFromUrl(source, normalizedUrl);
  if (!sourceId) {
    throw new UnsupportedError(
      `could not derive sourceId for ${normalizedUrl}`,
    );
  }

  const persistence = await openEnqueuePersistence();
  const current = await persistence.loadExistingSave(source, sourceId);
  const incomingKinds = mergeListKinds(
    opts.listKinds,
    listKindsFromTrigger(opts.trigger),
  );

  if (current) {
    await persistMergedListKinds(
      current.id,
      current.listKinds,
      incomingKinds,
      opts.trigger ?? "pipeline:enqueue",
    );
    await adoptOrphanedSave(current, opts);
    const existing: EnqueueOneResult = { id: current.id, created: false };
    if (harvestShouldRestoreSave(current, isInteractiveTrigger(opts.trigger))) {
      await restoreSave(current.id, opts.trigger ?? "enqueue:restore");
      current.deletedAt = null;
      existing.restored = true;
      log.info("[pond pipeline:enqueue] restored save from trash", {
        id: current.id,
        source,
        trigger: opts.trigger,
      });
    }
    if (harvestShouldIgnoreSave(current)) {
      stashWebCookiesThenKick(current.id, source, opts.cookies);
      log.info("[pond pipeline:enqueue] existing save", {
        id: current.id,
        source,
        trigger: opts.trigger,
        ignored: current.status,
      });
      return { id: current.id, created: false };
    }
    if (isInteractiveTrigger(opts.trigger) && current.status === "ingesting") {
      await promoteInteractiveSaveTasks(current.id);
    }
    if (opts.seed && harvestShouldReseedFailedSave(current, true)) {
      await resetTasksForSave(
        current.id,
        opts.trigger ?? "enqueue:reseed-failed",
        opts.generationId,
      );
      const { narrowToSplit } = await import("../split-save-plan");
      await applySeedToExistingSave(current.id, {
        ...opts.seed,
        rawJson: narrowToSplit(opts.seed.rawJson, current.rawJson?.split),
      });
      stashWebCookiesThenKick(current.id, source, opts.cookies);
      log.info("[pond pipeline:enqueue] reseeded failed save", {
        id: current.id,
        source,
        trigger: opts.trigger,
      });
      return { ...existing, reseeded: true };
    }
    if (opts.force) {
      await resetTasksForSave(
        current.id,
        opts.trigger ?? "enqueue:force",
        opts.generationId,
      );
    } else if (opts.seed) {
      const merge = mergeSeedIntoExistingSave(current, opts.seed);
      if (merge.changed) {
        await persistEnrichment(current.id, merge);
        if (merge.didFillAvatarUrl) {
          await rependFetchAvatar(current.id);
        }
        log.info("[pond pipeline:enqueue] enriched existing save", {
          id: current.id,
          source,
          trigger: opts.trigger,
          filled: merge.filled,
        });
      }
    } else if (
      source === "web" &&
      (opts.cookies?.length ?? 0) > 0 &&
      (current.status === "complete" || current.status === "failed")
    ) {
      await rependArchiveForCookies(current.id);
    }
    stashWebCookiesThenKick(current.id, source, opts.cookies);
    log.info("[pond pipeline:enqueue] existing save", {
      id: current.id,
      source,
      trigger: opts.trigger,
      force: opts.force === true,
    });
    return existing;
  }

  const now = new Date();
  const candidate: EnqueueCandidate = {
    url: normalizedUrl,
    source,
    sourceId,
    listKinds: incomingKinds,
  };
  if (opts.seed) candidate.seed = opts.seed;
  const bundle = createEnqueueBundle(
    candidate,
    opts,
    now,
    opts.trigger ?? "pipeline:enqueue",
    await newSaveInboxForTrigger(opts.trigger),
  );
  const insertedAction = persistence.insertBundle(bundle);
  if (insertedAction) broadcastSyncAction(insertedAction);
  await fileIncomingSaves(
    [bundle.save.id],
    opts.accountId,
    source,
    opts.trigger ?? "pipeline:enqueue",
  );

  log.info("[pond pipeline:enqueue] created save", {
    id: bundle.save.id,
    source,
    sourceId,
    trigger: opts.trigger,
  });
  stashWebCookiesThenKick(bundle.save.id, source, opts.cookies);
  return { id: bundle.save.id, created: true };
}

const BULK_INSERT_CHUNK = 100;

async function enqueueMany(
  items: readonly EnqueueItem[],
  opts: EnqueueOptions = {},
): Promise<EnqueueManyResult> {
  const persistence = await openEnqueuePersistence();
  const result: EnqueueManyResult = {
    created: 0,
    existing: 0,
    failed: 0,
    createdIds: [],
  };
  const normalized = normalizeEnqueueItems(items, opts.trigger);
  const { candidates } = normalized;
  result.failed = normalized.failed;
  if (candidates.length === 0) return result;

  const existingKeys = await persistence.loadExistingCandidateKeys(candidates);

  const fresh: EnqueueCandidate[] = [];
  const existing: EnqueueCandidate[] = [];
  for (const candidate of candidates) {
    if (existingKeys.has(enqueueCandidateKey(candidate))) {
      existing.push(candidate);
    } else {
      fresh.push(candidate);
    }
  }

  for (const candidate of existing) {
    try {
      const one: EnqueueOptions = {
        trigger: opts.trigger,
        force: opts.force,
        accountId: opts.accountId,
        adoptOrphaned: opts.adoptOrphaned,
        listKinds: candidate.listKinds,
      };
      if (candidate.seed) one.seed = candidate.seed;
      await enqueueOne(candidate.url, one);
      result.existing += 1;
    } catch (err) {
      result.failed += 1;
      log.warn(
        "[pond pipeline:enqueue] many existing item failed",
        candidate.url,
        err,
      );
    }
  }

  if (fresh.length === 0) {
    if (result.existing > 0) kickReconciler();
    return result;
  }

  const now = new Date();
  const actorReason = opts.trigger ?? "pipeline:enqueue:many";
  const inbox = await newSaveInboxForTrigger(opts.trigger);
  const bundles = fresh.map((candidate) =>
    createEnqueueBundle(candidate, opts, now, actorReason, inbox),
  );
  const insertedActions = await persistence.insertBundles(
    bundles,
    BULK_INSERT_CHUNK,
  );

  result.created = fresh.length;
  result.createdIds = bundles.map((bundle) => bundle.save.id);
  for (const action of insertedActions) broadcastSyncAction(action);
  const idsBySource = new Map<Source, string[]>();
  for (const bundle of bundles) {
    const ids = idsBySource.get(bundle.save.source) ?? [];
    ids.push(bundle.save.id);
    idsBySource.set(bundle.save.source, ids);
  }
  for (const [itemSource, ids] of idsBySource) {
    await fileIncomingSaves(
      ids,
      opts.accountId,
      itemSource,
      opts.trigger ?? "pipeline:enqueue",
    );
  }
  kickReconciler();
  log.info("[pond pipeline:enqueue] many", {
    created: result.created,
    existing: result.existing,
    failed: result.failed,
    trigger: opts.trigger,
  });
  return result;
}
