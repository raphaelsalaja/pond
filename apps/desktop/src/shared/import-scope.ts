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
  /** Whether Add to Folders can file every collection when none are picked; false where an empty pick means one default list. */
  fileEveryCollection: boolean;
  /** Media kinds the Source mixes; empty when every save holds the same kind. */
  mediaKinds: readonly ImportMediaKind[];
  /** Whether captures carry a publish date the `since` limit can compare. */
  since: boolean;
  /** Set when `since` compares the day you saved an item, because the Source has no publish date. */
  sinceDate?: "saved";
  /** Set when save dates only come a page at a time, so a `since` limit can bring in up to this many older items. */
  sincePageSize?: number;
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
  fileEveryCollection: false,
  mediaKinds: [],
  since: false,
};

const SAVED_AND_LIKED: readonly ListKind[] = ["saved", "liked"];
const ALL_MEDIA: readonly ImportMediaKind[] = ["image", "video", "text"];

const IMPORT_SCOPE_OPTIONS = {
  twitter: {
    listKinds: SAVED_AND_LIKED,
    collections: "folder",
    fileEveryCollection: true,
    mediaKinds: ALL_MEDIA,
    since: true,
  },
  youtube: {
    listKinds: SAVED_AND_LIKED,
    collections: "playlist",
    fileEveryCollection: false,
    mediaKinds: [],
    since: true,
  },
  cosmos: { ...EVERYTHING_ONLY, mediaKinds: ["image", "video"] },
  arena: { ...EVERYTHING_ONLY, mediaKinds: ALL_MEDIA, since: true },
  pinterest: {
    listKinds: [],
    collections: "board",
    fileEveryCollection: true,
    mediaKinds: ["image", "video"],
    since: true,
  },
  instagram: {
    listKinds: SAVED_AND_LIKED,
    collections: "collection",
    fileEveryCollection: true,
    mediaKinds: ["image", "video"],
    since: true,
  },
  tiktok: {
    listKinds: SAVED_AND_LIKED,
    collections: "collection",
    fileEveryCollection: true,
    mediaKinds: [],
    since: true,
  },
  reddit: {
    listKinds: SAVED_AND_LIKED,
    collections: null,
    fileEveryCollection: false,
    mediaKinds: ALL_MEDIA,
    since: true,
  },
  threads: { ...EVERYTHING_ONLY, mediaKinds: ALL_MEDIA, since: true },
  github: {
    ...EVERYTHING_ONLY,
    since: true,
    sinceDate: "saved",
    sincePageSize: 30,
  },
  substack: {
    listKinds: ["saved", "liked", "subscription"],
    collections: null,
    fileEveryCollection: false,
    mediaKinds: [],
    since: true,
  },
  tumblr: { ...EVERYTHING_ONLY, mediaKinds: ALL_MEDIA, since: true },
  savee: {
    ...EVERYTHING_ONLY,
    mediaKinds: ["image", "video"],
    since: true,
    sinceDate: "saved",
  },
  behance: {
    ...EVERYTHING_ONLY,
    mediaKinds: ["image", "video"],
    since: true,
    sinceDate: "saved",
  },
  vimeo: {
    listKinds: SAVED_AND_LIKED,
    collections: null,
    fileEveryCollection: false,
    mediaKinds: [],
    since: true,
  },
  dribbble: { ...EVERYTHING_ONLY, mediaKinds: ["image", "video"] },
  unsplash: { ...EVERYTHING_ONLY, mediaKinds: ["image"] },
  bluesky: {
    listKinds: SAVED_AND_LIKED,
    collections: null,
    fileEveryCollection: false,
    mediaKinds: ALL_MEDIA,
    since: true,
    sinceDate: "saved",
  },
  marked: {
    ...EVERYTHING_ONLY,
    mediaKinds: ["image", "video"],
    since: true,
    sinceDate: "saved",
  },
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
    if (listKinds.length === 0) next.listKinds = [];
    else if (listKinds.length < options.listKinds.length) {
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
  } else if (
    scope.addToFolders === true &&
    options.fileEveryCollection &&
    importsListKind(next, "saved")
  ) {
    next.addToFolders = true;
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

/** Sources with Accounts where none imports Likes, so the extension stops saving likes there too. */
export function sourcesSkippingLikes(
  accounts: readonly {
    source: Source;
    sync: { importScope?: ImportScope; syncLikes?: boolean };
  }[],
): Set<Source> {
  const skipping = new Set<Source>();
  const importing = new Set<Source>();
  for (const account of accounts) {
    const scope = accountImportScope(account.source, account.sync);
    if (importsListKind(scope, "liked")) importing.add(account.source);
    else skipping.add(account.source);
  }
  for (const source of importing) skipping.delete(source);
  return skipping;
}

export function importsListKind(
  scope: ImportScope | undefined,
  kind: ListKind,
): boolean {
  return !scope?.listKinds || scope.listKinds.includes(kind);
}

/** An empty `listKinds` imports nothing. Omitting the field still imports every list. */
export function importsAnyList(source: Source, scope: ImportScope): boolean {
  const options = importScopeOptions(source);
  if (options.listKinds.length === 0) return true;
  if (!scope.listKinds) return true;
  return scope.listKinds.length > 0;
}

export function importsEverything(scope: ImportScope | undefined): boolean {
  return (
    !scope?.listKinds &&
    !scope?.collections?.length &&
    !scope?.mediaKinds &&
    !scope?.since
  );
}

export type CollectionFiling = "picked" | "every" | "off";

/** Picked collections file by default; with none picked, every collection files only when you turn it on. */
export function collectionFiling(
  source: Source,
  scope: ImportScope | undefined,
): CollectionFiling {
  const options = importScopeOptions(source);
  if (!options.collections || !importsListKind(scope, "saved")) return "off";
  if (scope?.collections?.length) {
    return scope.addToFolders === false ? "off" : "picked";
  }
  return options.fileEveryCollection && scope?.addToFolders === true
    ? "every"
    : "off";
}

export type ImportFilterReason = "list" | "media" | "since";

/** Skips a save only from lists the scope leaves out; a save on no known list is kept. */
export function listFilterReason(
  scope: ImportScope | undefined,
  listKinds: readonly ListKind[],
): "list" | null {
  if (!scope?.listKinds || listKinds.length === 0) return null;
  return listKinds.some((kind) => scope.listKinds?.includes(kind))
    ? null
    : "list";
}

/** Where a `since` limit that compares the day you saved an item starts, or null when the Source compares publish dates. */
export function savedSinceStart(
  source: Source,
  scope: ImportScope | undefined,
): Date | null {
  if (importScopeOptions(source).sinceDate !== "saved" || !scope?.since) {
    return null;
  }
  return sinceStart(scope.since);
}

/** Why the scope skips a captured save, or null to keep it. A missing publish date keeps the save. */
export function importFilterReason(
  scope: ImportScope | undefined,
  save: {
    listKinds: readonly ListKind[];
    mediaType: MediaType | null;
    publishedAt: Date | null;
  },
): ImportFilterReason | null {
  const list = listFilterReason(scope, save.listKinds);
  if (list) return list;
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
