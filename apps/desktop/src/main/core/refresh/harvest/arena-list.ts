/// <reference lib="dom" />

/**
 * Are.na list harvester. The orchestrator navigates to
 * `https://www.are.na/<slug>/channels?per=100` (the user's owned-channels
 * index) and the in-page expression collects every block id linked
 * one level deep.
 *
 * Are.na blocks are public, so per-block enrichment goes through the
 * standard harvester at `/block/<id>`. Auth wall: `/log-in` redirect.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

export function arenaProfileUrl(slug: string): string {
  return `https://www.are.na/${encodeURIComponent(slug)}/channels?per=100`;
}

export function buildArenaListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageArenaList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageArenaList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/log-in") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/auth")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{ sourceId: string; url: string }> {
    const out: Array<{ sourceId: string; url: string }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/block/"]'),
    );
    for (const a of links) {
      let id: string | null = null;
      try {
        const u = new URL(a.href, location.origin);
        id = u.pathname.match(/\/block\/(\d+)/)?.[1] ?? null;
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ sourceId: id, url: `https://www.are.na/block/${id}` });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector('a[href*="/block/"]')) break;
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
