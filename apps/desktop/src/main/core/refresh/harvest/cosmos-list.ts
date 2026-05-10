/// <reference lib="dom" />

/**
 * Cosmos library list harvester. Walks the user's "Library" view
 * (`https://www.cosmos.so/library`) which renders every element the
 * user has saved across every cluster they own. Each card links out
 * to `https://www.cosmos.so/e/<elementId>`.
 *
 * Auth wall: cosmos.so/library 302s to `/auth` for signed-out users.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

export const COSMOS_LIST_URL = "https://www.cosmos.so/library";

export function buildCosmosListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageCosmosList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageCosmosList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/sign-in")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{ sourceId: string; url: string }> {
    const out: Array<{ sourceId: string; url: string }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/e/"]'),
    );
    for (const a of links) {
      let id: string | null = null;
      let pathname = "";
      try {
        const u = new URL(a.href, location.origin);
        pathname = u.pathname;
        id = pathname.match(/\/e\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ sourceId: id, url: `https://www.cosmos.so${pathname}` });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector('a[href*="/e/"]')) break;
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
