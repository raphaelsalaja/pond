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
  importsEverything,
  sinceStart,
} from "@shared/import-scope";
import type { OkResult } from "@shared/query-contracts-shared";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { syncMonitor } from "@/features/sources/state/sync-monitor";

const SOURCE_LIST_KIND_LABELS = {
  instagram: { saved: "Saved Posts", liked: "Liked Posts" },
  youtube: { saved: "Saved Videos", liked: "Liked Videos" },
  tiktok: { saved: "Favorites", liked: "Liked Videos" },
  reddit: { saved: "Saved Posts", liked: "Upvoted Posts" },
  twitter: { saved: "Bookmarks", liked: "Likes" },
} satisfies Partial<Record<Source, Record<ListKind, string>>>;

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
  item: { one: string; many: string };
}

const COLLECTION_NOUNS = {
  board: {
    one: "board",
    many: "boards",
    title: "Boards",
    all: "All Pins",
    item: { one: "pin", many: "pins" },
  },
  collection: {
    one: "collection",
    many: "collections",
    title: "Collections",
    all: "All Saved Posts",
    item: { one: "post", many: "posts" },
  },
  folder: {
    one: "bookmark folder",
    many: "folders",
    title: "Folders",
    all: "All Bookmarks",
    item: { one: "post", many: "posts" },
  },
  playlist: {
    one: "playlist",
    many: "playlists",
    title: "Playlists",
    all: "Watch Later",
    item: { one: "video", many: "videos" },
  },
} satisfies Record<ImportCollectionKind, CollectionNouns>;

export function listKindLabel(source: Source, kind: ListKind): string {
  switch (source) {
    case "instagram":
    case "youtube":
    case "tiktok":
    case "reddit":
    case "twitter":
      return SOURCE_LIST_KIND_LABELS[source][kind];
    default:
      return LIST_KIND_LABELS[kind];
  }
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

export function importScopeSummary(
  source: Source,
  scope: ImportScope | undefined,
): string {
  if (importsEverything(scope)) return "Everything";
  const parts = [whatSummary(source, scope)];
  if (scope?.mediaKinds) {
    parts.push(scope.mediaKinds.map(mediaKindLabel).join(" and "));
  }
  if (scope?.since) parts.push(`from ${formatSince(scope.since)}`);
  return parts.filter(Boolean).join(", ");
}

function whatSummary(source: Source, scope: ImportScope | undefined): string {
  const collections = scope?.collections ?? [];
  const kind = importScopeOptions(source).collections;
  const listKinds = scope?.listKinds ?? importScopeOptions(source).listKinds;
  const lists = listKinds.map((listKind) => {
    if (listKind !== "saved" || !kind || collections.length === 0) {
      return listKindLabel(source, listKind);
    }
    const [first] = collections;
    return collections.length === 1 && first
      ? first.name
      : `${collections.length} ${collectionNouns(kind).many}`;
  });
  if (lists.length > 0) return lists.join(" and ");
  return scope?.mediaKinds || scope?.since ? "" : "Everything";
}

export type SincePreset =
  | "any"
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
} satisfies Record<Exclude<SincePreset, "any" | "custom">, number>;

export const SINCE_PRESETS = [
  { value: "any", label: "Any Time" },
  { value: "month", label: "Past Month" },
  { value: "quarter", label: "Past 3 Months" },
  { value: "half", label: "Past 6 Months" },
  { value: "year", label: "Past Year" },
  { value: "custom", label: "Custom Date" },
] as const satisfies ReadonlyArray<{ value: SincePreset; label: string }>;

/** The local `YYYY-MM-DD` a preset starts from; empty for any time or a custom date. */
export function sinceForPreset(preset: SincePreset, now = new Date()): string {
  if (preset === "any" || preset === "custom") return "";
  const start = new Date(
    now.getFullYear(),
    now.getMonth() - SINCE_PRESET_MONTHS[preset],
    now.getDate(),
  );
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${start.getFullYear()}-${month}-${day}`;
}

export function formatSince(since: string): string {
  const start = sinceStart(since);
  return start
    ? start.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : since;
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
  });
  if (!result.ok) return result;
  if (input.start) {
    syncMonitor.seed(input.accountId, input.source, { connected: true });
    void window.pond.syncRunNow(input.accountId);
  }
  await refetchAccounts();
  return { ok: true };
}
