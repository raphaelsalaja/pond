import { sourceLabel } from "./source-ids";
import type { Source } from "./source-ids";

export const WATCH_KINDS = [
  "channel",
  "user",
  "group",
  "playlist",
  "board",
  "cluster",
  "feed",
  "list",
] as const;

export type WatchKind = (typeof WATCH_KINDS)[number];

const WATCHABLE_SOURCES = [
  "arena",
  "youtube",
  "tiktok",
  "instagram",
  "twitter",
  "pinterest",
  "cosmos",
  "web",
] as const satisfies ReadonlyArray<Source>;

export function isWatchableSource(
  source: Source,
): source is (typeof WATCHABLE_SOURCES)[number] {
  return WATCHABLE_SOURCES.some((candidate) => candidate === source);
}

export const WATCH_NEEDS_SESSION: ReadonlyArray<Source> = [
  "instagram",
  "twitter",
];

export function watchSourceLabel(source: Source): string {
  return source === "web" ? "RSS Feed" : sourceLabel(source);
}

export function watchKindLabel(kind: WatchKind | undefined): string {
  return !kind || kind === "user" ? "account" : kind;
}

export function watchHandleLabel(handle: string, kind?: WatchKind): string {
  return kind === "playlist" || kind === "list" || kind === "feed"
    ? handle
    : `@${handle}`;
}

export function normalizeFeedUrl(input: string, base?: string): string | null {
  try {
    const url = new URL(input.trim(), base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
