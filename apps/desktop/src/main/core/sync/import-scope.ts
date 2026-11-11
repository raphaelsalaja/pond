import type {
  ImportCollection,
  ImportScope,
  ListKind,
  Source,
  SourceSyncPrefs,
} from "@pond/schema/db";
import {
  accountImportScope,
  collectionFiling,
  importsEverything,
  importsListKind,
} from "../../../shared/import-scope";

/** Sources whose Account sync walks Likes as a second list beside the main saved list. */
const SEPARATE_LIKED_LISTS: ReadonlySet<Source> = new Set([
  "instagram",
  "threads",
  "twitter",
  "youtube",
]);

/** Sources that read saved and liked items in one walk, which skips the tab or listing you leave out. */
export const COMBINED_LISTS: ReadonlySet<Source> = new Set([
  "reddit",
  "tiktok",
  "substack",
  "vimeo",
  "bluesky",
]);

/** Sources that can also import new posts from what you subscribe to, as their own pass. */
const SUBSCRIPTION_SOURCES: ReadonlySet<Source> = new Set(["substack"]);

export interface ListHarvestPlan {
  primary: boolean;
  liked: boolean;
  subscriptions: boolean;
  /** What a combined walk reads; empty for Sources that walk their lists separately. */
  listKinds: ListKind[];
  collections: ImportCollection[] | null;
  /** Walk every collection after the lists so each save can be filed into its collection's Folder. */
  fileEveryCollection: boolean;
}

export function listHarvestPlan(
  source: Source,
  scope: ImportScope | undefined,
): ListHarvestPlan {
  const saved = importsListKind(scope, "saved");
  const subscriptions =
    SUBSCRIPTION_SOURCES.has(source) && importsListKind(scope, "subscription");
  const collections =
    saved && scope?.collections && scope.collections.length > 0
      ? scope.collections
      : null;
  if (COMBINED_LISTS.has(source)) {
    /** Picked collections replace the saved tab, so the combined walk keeps only what's left. */
    const listKinds = (["saved", "liked"] as const).filter(
      (kind) =>
        importsListKind(scope, kind) && !(kind === "saved" && collections),
    );
    return {
      primary: listKinds.length > 0,
      liked: false,
      subscriptions,
      listKinds,
      collections,
      fileEveryCollection: collectionFiling(source, scope) === "every",
    };
  }
  const separateLiked = SEPARATE_LIKED_LISTS.has(source);
  return {
    primary: collections === null && (!separateLiked || saved),
    liked: separateLiked && importsListKind(scope, "liked"),
    subscriptions,
    listKinds: [],
    collections,
    fileEveryCollection: collectionFiling(source, scope) === "every",
  };
}

const COLLECTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** A first read reaches back this far, so connecting shows the last week of posts rather than an archive. */
const SUBSCRIPTION_FIRST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface SubscriptionCheck {
  due: boolean;
  since: string;
}

/** Reading every subscribed feed costs one request per publication, so it runs a few times a day. */
export function subscriptionCheck(
  sync: Pick<SourceSyncPrefs, "lastSubscriptionCheckAt">,
  now = Date.now(),
): SubscriptionCheck {
  const last = sync.lastSubscriptionCheckAt
    ? Date.parse(sync.lastSubscriptionCheckAt)
    : Number.NaN;
  if (!Number.isFinite(last)) {
    return {
      due: true,
      since: new Date(now - SUBSCRIPTION_FIRST_WINDOW_MS).toISOString(),
    };
  }
  return {
    due: now - last >= SUBSCRIPTION_CHECK_INTERVAL_MS,
    since: new Date(last).toISOString(),
  };
}

/** Collection walks stop at known saves, so a save moved into a collection later only turns up on a daily read to the end. */
export function collectionCheckDue(
  plan: Pick<ListHarvestPlan, "collections" | "fileEveryCollection">,
  sync: Pick<SourceSyncPrefs, "lastCollectionCheckAt">,
  full: boolean,
  now = Date.now(),
): boolean {
  if (plan.collections === null && !plan.fileEveryCollection) return false;
  if (full) return true;
  const last = sync.lastCollectionCheckAt
    ? Date.parse(sync.lastCollectionCheckAt)
    : Number.NaN;
  return !Number.isFinite(last) || now - last >= COLLECTION_CHECK_INTERVAL_MS;
}

export function isImportPending(
  sync: Pick<SourceSyncPrefs, "importPending">,
): boolean {
  return sync.importPending === true;
}

export function importScopePatch(
  source: Source,
  current: Pick<SourceSyncPrefs, "importScope" | "syncLikes">,
  scope: ImportScope,
  { start = true }: { start?: boolean } = {},
): Partial<SourceSyncPrefs> {
  const next =
    importsEverything(scope) && scope.addToFolders === undefined
      ? undefined
      : scope;
  const patch: Partial<SourceSyncPrefs> = { importScope: next };
  if (start) patch.importPending = false;
  if (current.syncLikes !== undefined) patch.syncLikes = undefined;
  /** Early stop ends a walk at ids already in the Library, so a new selection needs one full walk to reach its older items. */
  if (!sameScope(accountImportScope(source, current), next)) {
    patch.lastFullSyncAt = null;
    patch.resumeCursor = null;
  }
  return patch;
}

function sameScope(
  a: ImportScope | undefined,
  b: ImportScope | undefined,
): boolean {
  return scopeKey(a) === scopeKey(b);
}

function scopeKey(scope: ImportScope | undefined): string {
  if (!scope) return "";
  const sorted = (values: readonly string[] | undefined): string =>
    values ? [...values].sort().join(",") : "*";
  return [
    sorted(scope.listKinds),
    sorted(scope.collections?.map((collection) => collection.id)),
    sorted(scope.mediaKinds),
    scope.since ?? "*",
    String(scope.addToFolders ?? "default"),
  ].join("|");
}
