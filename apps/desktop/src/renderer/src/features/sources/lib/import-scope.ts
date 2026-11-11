import type {
  ImportMediaKind,
  ImportScope,
  ListKind,
  Source,
} from "@pond/schema/db";
import { LIST_KIND_LABELS } from "@pond/schema/list-kinds";
import {
  type ImportCollectionKind,
  importScopeOptions,
} from "@shared/import-scope";
import type { OkResult } from "@shared/query-contracts-shared";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { syncMonitor } from "@/features/sources/state/sync-monitor";

type ListKindCopy = Partial<Record<ListKind, string>>;

const SOURCE_LIST_KIND_LABELS = new Map<Source, ListKindCopy>([
  ["instagram", { saved: "Saved Posts", liked: "Liked Posts" }],
  ["youtube", { saved: "Saved Videos", liked: "Liked Videos" }],
  ["tiktok", { saved: "Favorites", liked: "Liked Videos" }],
  ["reddit", { saved: "Saved Posts", liked: "Upvoted Posts" }],
  ["threads", { saved: "Saved Posts", liked: "Liked Posts" }],
  ["twitter", { saved: "Bookmarks", liked: "Likes" }],
  [
    "substack",
    {
      saved: "Saved Posts",
      liked: "Liked Posts",
      subscription: "Subscriptions",
    },
  ],
  ["vimeo", { saved: "Watch Later", liked: "Likes" }],
  ["bluesky", { saved: "Bookmarks", liked: "Likes" }],
]);

const SOURCE_LIST_KIND_DESCRIPTIONS = new Map<Source, ListKindCopy>([
  [
    "instagram",
    {
      saved: "Posts you've saved on Instagram.",
      liked: "Posts you've liked on Instagram.",
    },
  ],
  [
    "youtube",
    {
      saved: "Videos you've saved on YouTube.",
      liked: "Videos you've liked on YouTube.",
    },
  ],
  [
    "tiktok",
    {
      saved: "Videos you've added to Favorites on TikTok.",
      liked: "Videos you've liked on TikTok.",
    },
  ],
  [
    "reddit",
    {
      saved: "Posts you've saved on Reddit.",
      liked: "Posts you've upvoted on Reddit.",
    },
  ],
  [
    "threads",
    {
      saved: "Posts you've saved on Threads.",
      liked: "Posts you've liked on Threads.",
    },
  ],
  [
    "twitter",
    {
      saved: "Posts you've bookmarked on Twitter.",
      liked: "Posts you've liked on Twitter.",
    },
  ],
  [
    "substack",
    {
      saved: "Posts you've saved on Substack.",
      liked: "Posts you've liked on Substack.",
      subscription:
        "New posts from publications you subscribe to, from the week you connect onward.",
    },
  ],
  [
    "vimeo",
    {
      saved: "Videos you've added to Watch Later on Vimeo.",
      liked: "Videos you've liked on Vimeo.",
    },
  ],
  [
    "bluesky",
    {
      saved: "Posts you've bookmarked on Bluesky.",
      liked: "Posts you've liked on Bluesky.",
    },
  ],
]);

const MEDIA_KIND_LABELS = {
  image: "Images",
  video: "Videos",
  text: "Text Posts",
} satisfies Record<ImportMediaKind, string>;

interface CollectionNouns {
  one: string;
  many: string;
  title: string;
  all: string;
}

const COLLECTION_NOUNS = {
  board: {
    one: "board",
    many: "boards",
    title: "Boards",
    all: "All Pins",
  },
  collection: {
    one: "collection",
    many: "collections",
    title: "Collections",
    all: "All Saved Posts",
  },
  folder: {
    one: "bookmark folder",
    many: "folders",
    title: "Folders",
    all: "All Bookmarks",
  },
  playlist: {
    one: "playlist",
    many: "playlists",
    title: "Playlists",
    all: "Watch Later",
  },
} satisfies Record<ImportCollectionKind, CollectionNouns>;

export function listKindLabel(source: Source, kind: ListKind): string {
  return SOURCE_LIST_KIND_LABELS.get(source)?.[kind] ?? LIST_KIND_LABELS[kind];
}

export function listKindDescription(
  source: Source,
  kind: ListKind,
): string | null {
  return SOURCE_LIST_KIND_DESCRIPTIONS.get(source)?.[kind] ?? null;
}

export function mediaKindLabel(kind: ImportMediaKind): string {
  return MEDIA_KIND_LABELS[kind];
}

export function collectionNouns(kind: ImportCollectionKind): CollectionNouns {
  return COLLECTION_NOUNS[kind];
}

/** Whether the Source offers any choice beyond importing everything. */
export function hasImportChoices(source: Source): boolean {
  const options = importScopeOptions(source);
  return (
    options.listKinds.length > 0 ||
    options.collections !== null ||
    options.mediaKinds.length > 0 ||
    options.since
  );
}

export function hasImportLists(source: Source): boolean {
  const options = importScopeOptions(source);
  return options.listKinds.length > 0 || options.collections !== null;
}

export function hasImportFilters(source: Source): boolean {
  const options = importScopeOptions(source);
  return options.mediaKinds.length > 0 || options.since;
}

export type SincePreset =
  | "any"
  | "today"
  | "month"
  | "quarter"
  | "half"
  | "year"
  | "custom";

const SINCE_PRESET_MONTHS = {
  month: 1,
  quarter: 3,
  half: 6,
  year: 12,
} satisfies Record<Exclude<SincePreset, "any" | "today" | "custom">, number>;

const SINCE_PRESETS = [
  { value: "any", label: "Any Time" },
  { value: "month", label: "Past Month" },
  { value: "quarter", label: "Past 3 Months" },
  { value: "half", label: "Past 6 Months" },
  { value: "year", label: "Past Year" },
  { value: "custom", label: "Custom Date" },
] as const satisfies ReadonlyArray<{ value: SincePreset; label: string }>;

const SAVED_SINCE_PRESETS = [
  { value: "any", label: "Any Time" },
  { value: "today", label: "From Today" },
  ...SINCE_PRESETS.slice(1),
] as const satisfies ReadonlyArray<{ value: SincePreset; label: string }>;

interface SinceCopy {
  title: string;
  description: string;
  presets: ReadonlyArray<{ value: SincePreset; label: string }>;
  /** Shown beside the title when some items have no date to compare. */
  info?: string;
}

/** Sources without publish dates compare the day you saved an item, and can start from today. */
export function sinceCopy(source: Source): SinceCopy {
  const options = importScopeOptions(source);
  if (options.sinceDate === "saved") {
    const copy: SinceCopy = {
      title: "Saved Since",
      description: "Skips items you saved before this date.",
      presets: SAVED_SINCE_PRESETS,
    };
    if (options.sincePageSize) {
      copy.info = `Dates are read a page of ${options.sincePageSize} at a time, so up to ${options.sincePageSize} older items can come in.`;
    }
    return copy;
  }
  return {
    title: "Posted Since",
    description: "Skips older posts by publish date.",
    presets: SINCE_PRESETS,
    info: "Posts without a publish date are always imported.",
  };
}

/** The local `YYYY-MM-DD` a preset starts from; empty for any time or a custom date. */
export function sinceForPreset(preset: SincePreset, now = new Date()): string {
  if (preset === "any" || preset === "custom") return "";
  if (preset === "today") return localDay(now);
  const start = new Date(
    now.getFullYear(),
    now.getMonth() - SINCE_PRESET_MONTHS[preset],
    now.getDate(),
  );
  return localDay(start);
}

/** A date as the local `YYYY-MM-DD` the scope stores. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function saveImportScope(input: {
  accountId: string;
  source: Source;
  scope: ImportScope;
  start: boolean;
}): Promise<OkResult> {
  const result = await window.pond.query("accounts.setImportScope", {
    accountId: input.accountId,
    scope: input.scope,
    start: input.start,
  });
  if (!result.ok) return result;
  if (input.start) startImportSync(input.accountId, input.source);
  await refetchAccounts();
  return { ok: true };
}

export function startImportSync(accountId: string, source: Source): void {
  syncMonitor.seed(accountId, source, { connected: true });
  void window.pond.syncRunNow(accountId);
}
