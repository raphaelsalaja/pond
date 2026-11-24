import type { Source, WatchKind } from "@pond/schema/db";
import { normalizeFeedUrl } from "@pond/schema/watches";
import log from "electron-log/main.js";
import { COSMOS_RESERVED_ROOTS } from "../pipeline/extractors/sources/cosmos";
import { PINTEREST_RESERVED_ROOTS } from "../pipeline/extractors/sources/pinterest";
import { readFeed } from "./feed";
import type { FetchWatchPage } from "./types";
import { verifyWatchTarget } from "./verify";

export interface WatchTarget {
  kind: WatchKind;
  handle: string;
  display: string;
  avatarUrl?: string;
}

const ARENA_PROBE_TIMEOUT_MS = 8000;

const ARENA_USER_TABS = new Set([
  "channels",
  "blocks",
  "index",
  "followers",
  "following",
  "all",
]);

function parseUrl(input: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(input)
      ? `https://${input}`
      : null;
  if (!candidate) {
    return null;
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function segmentsOf(url: URL): Array<string> {
  return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function hostIs(url: URL, ...domains: Array<string>): boolean {
  const host = url.hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

function cleanHandle(input: string): string {
  return input.trim().replace(/^@/, "");
}

function target(
  kind: WatchKind,
  handle: string,
  display?: string,
): WatchTarget {
  return { kind, handle, display: display ?? handle };
}

export async function resolveWatchTarget(
  source: Source,
  rawInput: string,
  fetchPage: FetchWatchPage = fetch,
): Promise<WatchTarget | null> {
  if (source === "web") {
    const url = normalizeFeedUrl(rawInput);
    if (!url) {
      return null;
    }
    const feed = await readFeed(url, fetchPage);
    if (!feed.ok) {
      if (feed.reason === "not_found") {
        return null;
      }
      throw new Error("The feed could not be checked.");
    }
    return target("feed", url, feed.title ?? url);
  }
  const parsed = await parseWatchTarget(source, rawInput, fetchPage);
  return parsed && source !== "arena"
    ? verifyWatchTarget(source, parsed, fetchPage)
    : parsed;
}

async function parseWatchTarget(
  source: Source,
  rawInput: string,
  fetchPage: FetchWatchPage,
): Promise<WatchTarget | null> {
  const input = rawInput.trim();
  if (!input) {
    return null;
  }
  const url = parseUrl(input);

  switch (source) {
    case "arena":
      return resolveArena(input, url, fetchPage);
    case "youtube":
      return resolveYoutube(input, url);
    case "tiktok":
      return resolveSimpleUser(input, url, ["tiktok.com"]);
    case "instagram":
      return resolveSimpleUser(input, url, ["instagram.com"]);
    case "twitter":
      return resolveTwitter(input, url);
    case "pinterest":
      return resolvePinterest(input, url);
    case "cosmos":
      return resolveCosmos(input, url);
    default:
      return null;
  }
}

async function resolveArena(
  input: string,
  url: URL | null,
  fetchPage: FetchWatchPage,
): Promise<WatchTarget | null> {
  if (url) {
    if (!hostIs(url, "are.na")) {
      return null;
    }
    const segs = segmentsOf(url);
    const first = segs[0];
    if (!first) {
      return null;
    }
    const second = segs[1];
    if (second && !ARENA_USER_TABS.has(second.toLowerCase())) {
      return probeArena(second, ["channel"], fetchPage);
    }
    return probeArena(first, ["user", "group", "channel"], fetchPage);
  }
  const slug = cleanHandle(input);
  if (!/^[\w.-]+$/.test(slug)) {
    return null;
  }
  return probeArena(slug, ["channel", "user", "group"], fetchPage);
}

async function probeArena(
  slug: string,
  order: readonly [
    "channel" | "user" | "group",
    ...Array<"channel" | "user" | "group">,
  ],
  fetchPage: FetchWatchPage,
): Promise<WatchTarget | null> {
  const paths = {
    channel: "channels",
    user: "users",
    group: "groups",
  } satisfies Record<"channel" | "user" | "group", string>;

  for (const kind of order) {
    try {
      const res = await fetchPage(
        `https://api.are.na/v3/${paths[kind]}/${encodeURIComponent(slug)}`,
        {
          credentials: "omit",
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(ARENA_PROBE_TIMEOUT_MS),
        },
      );
      if (res.ok) {
        return target(kind, slug);
      }
      if (res.status !== 404) {
        throw new Error("Are.na could not be checked.");
      }
    } catch (error) {
      log.warn("[pond watch:resolve] arena probe failed", slug, error);
      throw error;
    }
  }
  return null;
}

function resolveYoutube(input: string, url: URL | null): WatchTarget | null {
  if (url) {
    if (!hostIs(url, "youtube.com", "youtu.be")) {
      return null;
    }
    const list = url.searchParams.get("list");
    if (list) {
      return target("playlist", list);
    }
    const segs = segmentsOf(url);
    const first = segs[0];
    const second = segs[1];
    if (!first) {
      return null;
    }
    if (first.startsWith("@")) {
      const handle = first.slice(1);
      const tab = second?.toLowerCase();
      if (tab === "shorts" || tab === "streams") {
        return target("channel", `${handle}/${tab}`, `@${handle} ${tab}`);
      }
      return target("channel", handle, `@${handle}`);
    }
    if ((first === "channel" || first === "c" || first === "user") && second) {
      return target("channel", second, second);
    }
    return null;
  }
  const handle = cleanHandle(input);
  if (!/^[\w.-]+(\/(shorts|streams))?$/i.test(handle)) {
    return null;
  }
  return target("channel", handle, `@${handle}`);
}

function resolveSimpleUser(
  input: string,
  url: URL | null,
  domains: Array<string>,
): WatchTarget | null {
  if (url) {
    if (!hostIs(url, ...domains)) {
      return null;
    }
    const first = segmentsOf(url)[0];
    if (!first) {
      return null;
    }
    const handle = cleanHandle(first);
    return /^[\w.-]+$/.test(handle)
      ? target("user", handle, `@${handle}`)
      : null;
  }
  const handle = cleanHandle(input);
  return /^[\w.-]+$/.test(handle) ? target("user", handle, `@${handle}`) : null;
}

function resolveTwitter(input: string, url: URL | null): WatchTarget | null {
  if (url) {
    if (!hostIs(url, "x.com", "twitter.com")) {
      return null;
    }
    const segs = segmentsOf(url);
    const listId = segs[2];
    if (
      segs[0] === "i" &&
      segs[1] === "lists" &&
      listId &&
      /^\d+$/.test(listId)
    ) {
      return target("list", listId);
    }
    const first = segs[0];
    if (!first || first === "i") {
      return null;
    }
    const handle = cleanHandle(first);
    return /^\w+$/.test(handle) ? target("user", handle, `@${handle}`) : null;
  }
  const handle = cleanHandle(input);
  return /^\w+$/.test(handle) ? target("user", handle, `@${handle}`) : null;
}

function resolvePinterest(input: string, url: URL | null): WatchTarget | null {
  if (url) {
    if (!hostIs(url, "pinterest.com") && !hostIs(url, "pinterest.co.uk")) {
      return null;
    }
    const segs = segmentsOf(url);
    const first = segs[0];
    if (!first || PINTEREST_RESERVED_ROOTS.has(first.toLowerCase())) {
      return null;
    }
    const board = segs[1];
    if (board && !board.startsWith("_") && board !== "feed.rss") {
      return target("board", `${first}/${board}`);
    }
    return target("user", first, `@${first}`);
  }
  const slug = cleanHandle(input);
  const m = /^([\w.-]+)(?:\/([\w-]+))?$/.exec(slug);
  const user = m?.[1];
  if (!user) {
    return null;
  }
  return m[2]
    ? target("board", `${user}/${m[2]}`)
    : target("user", user, `@${user}`);
}

function resolveCosmos(input: string, url: URL | null): WatchTarget | null {
  if (url) {
    if (!hostIs(url, "cosmos.so")) {
      return null;
    }
    const segs = segmentsOf(url);
    const first = segs[0];
    if (!first || COSMOS_RESERVED_ROOTS.has(first.toLowerCase())) {
      return null;
    }
    return segs[1]
      ? target("cluster", `${first}/${segs[1]}`)
      : target("user", first, `@${first}`);
  }
  const slug = cleanHandle(input);
  const m = /^([\w.-]+)(?:\/([\w-]+))?$/.exec(slug);
  const user = m?.[1];
  if (!user) {
    return null;
  }
  return m[2]
    ? target("cluster", `${user}/${m[2]}`)
    : target("user", user, `@${user}`);
}
