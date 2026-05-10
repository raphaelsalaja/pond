/// <reference lib="dom" />

/**
 * YouTube list harvester. Watch Later (`WL`) and Liked Videos (`LL`)
 * live on separate playlist URLs; the orchestrator runs the same
 * in-page expression twice with different navigation targets.
 *
 * YouTube paginates with virtualised scroll and renders each video
 * tile under `ytd-playlist-video-renderer` with a `<a id="thumbnail"
 * href="/watch?v=...">` permalink we walk to extract `videoId`.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

/** Canonical Watch Later / Liked playlist URLs. Index 0 = WL, 1 = LL. */
export const YOUTUBE_LIST_URLS = [
  "https://www.youtube.com/playlist?list=WL",
  "https://www.youtube.com/playlist?list=LL",
] as const;

export function buildYoutubeListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageYoutubeList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageYoutubeList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/signin") ||
    location.hostname.includes("accounts.google.com")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{ sourceId: string; url: string }> {
    const out: Array<{ sourceId: string; url: string }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a#thumbnail[href*="/watch?v="], a[href*="/watch?v="]',
      ),
    );
    for (const a of links) {
      let id: string | null = null;
      try {
        const u = new URL(a.href, location.origin);
        id = u.searchParams.get("v");
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        sourceId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
      });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector('a[href*="/watch?v="]')) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const collected = new Map<string, { sourceId: string; url: string }>();
  function ingest(rows: Array<{ sourceId: string; url: string }>) {
    let sawKnown = false;
    for (const r of rows) {
      if (known.has(r.sourceId)) sawKnown = true;
      if (!collected.has(r.sourceId)) collected.set(r.sourceId, r);
      if (collected.size >= args.maxItems) return { sawKnown, full: true };
    }
    return { sawKnown, full: false };
  }

  ingest(collect());
  if (collected.size >= args.maxItems) {
    return {
      ok: true,
      entries: Array.from(collected.values()),
      reachedEnd: false,
    };
  }

  const scrollDeadline = Date.now() + 60_000;
  let lastHeight = document.documentElement.scrollHeight;
  let stable = 0;
  while (Date.now() < scrollDeadline) {
    window.scrollBy({
      top: window.innerHeight * 0.9,
      behavior: "instant" as ScrollBehavior,
    });
    await new Promise((r) => setTimeout(r, 700));
    const { full } = ingest(collect());
    if (full) {
      return {
        ok: true,
        entries: Array.from(collected.values()),
        reachedEnd: false,
      };
    }
    const sh = document.documentElement.scrollHeight;
    if (sh === lastHeight) {
      stable += 1;
      if (stable >= 4) {
        return {
          ok: true,
          entries: Array.from(collected.values()),
          reachedEnd: true,
        };
      }
    } else {
      stable = 0;
      lastHeight = sh;
    }
  }
  return {
    ok: true,
    entries: Array.from(collected.values()),
    reachedEnd: false,
  };
}
