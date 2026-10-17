import type {
  ImportCollection,
  ImportMediaKind,
  ImportScope,
  ListKind,
  MediaType,
  Source,
} from "@pond/schema/db";

export interface ImportScopeOptions {
  /** Lists the Account sync walks separately, so leaving one out skips its requests. */
  listKinds: readonly ListKind[];
  /** The kind of collection that can narrow the saved list, or null when the sync can only walk all of it. */
  collections: ImportCollectionKind | null;
  /** Media kinds the Source mixes; empty when every save holds the same kind. */
  mediaKinds: readonly ImportMediaKind[];
  /** Whether captures carry a publish date the `since` limit can compare. */
  since: boolean;
}

export type ImportCollectionKind =
  | "board"
  | "collection"
  | "folder"
  | "playlist";

export interface ImportCollectionOption extends ImportCollection {
  itemCount: number | null;
}

const EVERYTHING_ONLY: ImportScopeOptions = {
  listKinds: [],
  collections: null,
  mediaKinds: [],
  since: false,
};

const SAVED_AND_LIKED: readonly ListKind[] = ["saved", "liked"];
const ALL_MEDIA: readonly ImportMediaKind[] = ["image", "video", "text"];

const IMPORT_SCOPE_OPTIONS = {
  twitter: {
    listKinds: SAVED_AND_LIKED,
    collections: "folder",
    mediaKinds: ALL_MEDIA,
    since: true,
  },
  youtube: {
    listKinds: SAVED_AND_LIKED,
    collections: "playlist",
    mediaKinds: [],
    since: true,
  },
  cosmos: { ...EVERYTHING_ONLY, mediaKinds: ["image", "video"] },
  arena: { ...EVERYTHING_ONLY, mediaKinds: ALL_MEDIA, since: true },
  pinterest: {
    listKinds: [],
    collections: "board",
    mediaKinds: ["image", "video"],
    since: true,
  },
  instagram: {
    listKinds: SAVED_AND_LIKED,
    collections: "collection",
    mediaKinds: ["image", "video"],
    since: true,
  },
  tiktok: {
    listKinds: SAVED_AND_LIKED,
    collections: null,
    mediaKinds: [],
    since: true,
  },
  reddit: {
    listKinds: SAVED_AND_LIKED,
    collections: null,
    mediaKinds: ALL_MEDIA,
    since: true,
  },
  threads: { ...EVERYTHING_ONLY, mediaKinds: ALL_MEDIA, since: true },
  web: EVERYTHING_ONLY,
  local: EVERYTHING_ONLY,
} satisfies Record<Source, ImportScopeOptions>;

export function importScopeOptions(source: Source): ImportScopeOptions {
  return IMPORT_SCOPE_OPTIONS[source];
}

export type ImportScopeProblem =
  | "no_lists"
  | "no_collections"
  | "no_media"
  | "bad_since";

export type NormalizedImportScope =
  | { ok: true; scope: ImportScope }
  | { ok: false; problem: ImportScopeProblem };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Drops parts the Source can't honor and collapses a full selection to the omitted form, so "everything" has one representation. */
export function normalizeImportScope(
  source: Source,
  scope: ImportScope,
): NormalizedImportScope {
  const options = importScopeOptions(source);
  const next: ImportScope = {};

  if (scope.listKinds && options.listKinds.length > 0) {
    const chosen = new Set(scope.listKinds);
    const listKinds = options.listKinds.filter((kind) => chosen.has(kind));
    if (listKinds.length === 0) return { ok: false, problem: "no_lists" };
    if (listKinds.length < options.listKinds.length) {
      next.listKinds = listKinds;
    }
  }

  if (
    scope.collections &&
    options.collections &&
    importsListKind(next, "saved")
  ) {
    const collections = uniqueCollections(scope.collections);
    if (collections.length === 0) {
      return { ok: false, problem: "no_collections" };
    }
    next.collections = collections;
    if (scope.addToFolders === false) next.addToFolders = false;
  }

  if (scope.mediaKinds && options.mediaKinds.length > 0) {
    const chosen = new Set(scope.mediaKinds);
    const mediaKinds = options.mediaKinds.filter((kind) => chosen.has(kind));
    if (mediaKinds.length === 0) return { ok: false, problem: "no_media" };
    if (mediaKinds.length < options.mediaKinds.length) {
      next.mediaKinds = mediaKinds;
    }
  }

  if (scope.since && options.since) {
    if (sinceStart(scope.since) === null) {
      return { ok: false, problem: "bad_since" };
    }
    next.since = scope.since;
  }

  return { ok: true, scope: next };
}

/** X Accounts saved before scoped imports turned Likes off with `syncLikes`. */
export function accountImportScope(
  source: Source,
  sync: {
    importScope?: ImportScope | undefined;
    syncLikes?: boolean | undefined;
  },
): ImportScope | undefined {
  const scope = sync.importScope;
  if (source !== "twitter" || sync.syncLikes !== false || scope?.listKinds) {
    return scope;
  }
  return { ...scope, listKinds: ["saved"] };
}

export function importsListKind(
  scope: ImportScope | undefined,
  kind: ListKind,
): boolean {
  return !scope?.listKinds || scope.listKinds.includes(kind);
}

export function importsEverything(scope: ImportScope | undefined): boolean {
  return (
    !scope?.listKinds &&
    !scope?.collections?.length &&
    !scope?.mediaKinds &&
    !scope?.since
  );
}

export type ImportFilterReason = "media" | "since";

/** Why the scope skips a captured save, or null to keep it. A missing publish date keeps the save. */
export function importFilterReason(
  scope: ImportScope | undefined,
  save: { mediaType: MediaType | null; publishedAt: Date | null },
): ImportFilterReason | null {
  if (scope?.mediaKinds) {
    const kind =
      save.mediaType === "image" || save.mediaType === "video"
        ? save.mediaType
        : save.mediaType === null || save.mediaType === "text"
          ? "text"
          : null;
    if (kind && !scope.mediaKinds.includes(kind)) return "media";
  }
  const start = scope?.since ? sinceStart(scope.since) : null;
  if (start && save.publishedAt && save.publishedAt < start) return "since";
  return null;
}

/** Local midnight that starts the `since` day, or null when it isn't a real calendar day. */
export function sinceStart(since: string): Date | null {
  const match = DAY.exec(since);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const start = new Date(year, month - 1, day);
  return start.getFullYear() === year &&
    start.getMonth() === month - 1 &&
    start.getDate() === day
    ? start
    : null;
}

function uniqueCollections(
  collections: readonly ImportCollection[],
): ImportCollection[] {
  const seen = new Set<string>();
  const out: ImportCollection[] = [];
  for (const collection of collections) {
    const id = collection.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: collection.name.trim() || id });
  }
  return out;
}
