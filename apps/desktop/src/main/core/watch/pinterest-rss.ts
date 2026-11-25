import type { WatchKind } from "@pond/schema/db";
import { readFeed } from "./feed";
import type { FetchWatchPage, WatchHarvestResult } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 PondBot/0.1";

function feedUrl(handle: string, kind?: WatchKind): string | null {
  if (kind === "board" || handle.includes("/")) {
    const [user, board] = handle.split("/", 2);
    if (!user || !board) return null;
    return `https://www.pinterest.com/${encodeURIComponent(user)}/${encodeURIComponent(board)}.rss`;
  }
  return `https://www.pinterest.com/${encodeURIComponent(handle)}/feed.rss`;
}

export async function listPinterestWatch(
  handle: string,
  kind?: WatchKind,
  signal?: AbortSignal,
  fetchPage: FetchWatchPage = fetch,
): Promise<WatchHarvestResult> {
  const url = feedUrl(handle, kind);
  if (!url) return { ok: false, reason: "unknown" };
  const feed = await readFeed(
    url,
    (address, init) => {
      const headers = new Headers(init.headers);
      headers.set("user-agent", USER_AGENT);
      return fetchPage(address, { ...init, headers });
    },
    signal,
  );
  if (!feed.ok) return feed;
  return {
    ok: true,
    entries: feed.entries.filter((entry) => entry.source === "pinterest"),
  };
}
