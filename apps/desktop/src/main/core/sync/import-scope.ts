import type {
  ImportCollection,
  ImportScope,
  ListKind,
  Source,
  SourceSyncPrefs,
} from "@pond/schema/db";
import {
  accountImportScope,
  importsEverything,
  importsListKind,
} from "../../../shared/import-scope";

/** Sources whose Account sync walks Likes as a second list beside the main saved list. */
const SEPARATE_LIKED_LISTS: ReadonlySet<Source> = new Set([
  "instagram",
  "twitter",
  "youtube",
]);

/** Sources that read saved and liked items in one walk, which skips the tab or listing you leave out. */
const COMBINED_LISTS: ReadonlySet<Source> = new Set(["reddit", "tiktok"]);

export interface ListHarvestPlan {
  primary: boolean;
  liked: boolean;
  /** What a combined walk reads; empty for Sources that walk their lists separately. */
  listKinds: ListKind[];
  collections: ImportCollection[] | null;
}

export function listHarvestPlan(
  source: Source,
  scope: ImportScope | undefined,
): ListHarvestPlan {
  const saved = importsListKind(scope, "saved");
  const collections =
    saved && scope?.collections && scope.collections.length > 0
      ? scope.collections
      : null;
  if (COMBINED_LISTS.has(source)) {
    return {
      primary: true,
      liked: false,
      listKinds: (["saved", "liked"] as const).filter((kind) =>
        importsListKind(scope, kind),
      ),
      collections: null,
    };
  }
  const separateLiked = SEPARATE_LIKED_LISTS.has(source);
  return {
    primary: collections === null && (!separateLiked || saved),
    liked: separateLiked && importsListKind(scope, "liked"),
    listKinds: [],
    collections,
  };
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
): Partial<SourceSyncPrefs> {
  const next = importsEverything(scope) ? undefined : scope;
  const patch: Partial<SourceSyncPrefs> = {
    importScope: next,
    importPending: false,
  };
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
    scope.addToFolders === false ? "loose" : "filed",
  ].join("|");
}
