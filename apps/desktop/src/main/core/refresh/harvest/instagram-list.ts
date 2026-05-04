/// <reference lib="dom" />

/**
 * Instagram saved-collection harvester. Walks
 * `https://www.instagram.com/<handle>/saved/all-posts/` and emits each
 * shortcode + permalink. Auth wall: redirects to `/accounts/login/`.
 *
 * IG renders the saved grid with `<a href="/p/<shortcode>/">` /
 * `<a href="/reel/<shortcode>/">` anchors under each tile, lazy-loaded
 * via virtualised scroll. We mirror the Twitter-bookmarks scroll-loop
 * with the same incremental / backfill semantics.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

export function instagramSavedUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/saved/all-posts/`;
}

export function buildInstagramListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageInstagramList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageInstagramList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/accounts/login") ||
    location.pathname.startsWith("/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{ sourceId: string; url: string }> {
    const out: Array<{ sourceId: string; url: string }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
      ),
    );
    for (const a of links) {
      let id: string | null = null;
      let kind = "p";
      try {
        const u = new URL(a.href, location.origin);
        const m = u.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (m?.[1] && m[2]) {
          kind = m[1];
          id = m[2];
        }
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        sourceId: id,
        url: `https://www.instagram.com/${kind}/${id}/`,
      });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (
      document.querySelector('a[href*="/p/"], a[href*="/reel/"]') ||
      document.querySelector("article")
    ) {
      break;
    }
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
  if (
    collected.size >= args.maxItems ||
    (args.mode === "incremental" &&
      Array.from(collected.values()).some((r) => known.has(r.sourceId)))
  ) {
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
    const { sawKnown, full } = ingest(collect());
    if (full) {
      return {
        ok: true,
        entries: Array.from(collected.values()),
        reachedEnd: false,
      };
    }
    if (args.mode === "incremental" && sawKnown) {
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
