/// <reference lib="dom" />

/**
 * TikTok favourites harvester. Walks `tiktok.com/@<handle>` with the
 * `?lang=en` qualifier on the favourites tab and emits each `aweme`
 * id from the rendered video grid.
 *
 * ⚠️ Partial — TikTok hides the favourites tab on web for some
 * accounts and the inject helper covers most live captures cheaply.
 * The DOM-walk path here is intentionally conservative: it picks up
 * any `<a href="/@<handle>/video/<id>">` link the SPA happens to
 * render, leaving the more elaborate API-sniff route for a future
 * iteration once we've validated against a logged-in account.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

export function tiktokFavouritesUrl(handle: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

export function buildTiktokListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageTiktokList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageTiktokList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.includes("/business")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{ sourceId: string; url: string }> {
    const out: Array<{ sourceId: string; url: string }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'),
    );
    for (const a of links) {
      let id: string | null = null;
      let pathname = "";
      try {
        const u = new URL(a.href, location.origin);
        pathname = u.pathname;
        id = pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ sourceId: id, url: `https://www.tiktok.com${pathname}` });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector('a[href*="/video/"]')) break;
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
