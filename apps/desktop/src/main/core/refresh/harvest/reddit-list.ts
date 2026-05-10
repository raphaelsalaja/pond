/// <reference lib="dom" />

/**
 * Reddit saved-list harvester. Old-Reddit's `/saved` view renders
 * each saved post as a `<div data-fullname="t3_...">` row with a
 * canonical permalink, which makes scraping tiny compared to the new
 * SPA. The orchestrator targets `https://old.reddit.com/user/<handle>/saved/`.
 *
 * Saved comments (`t1_...`) are surfaced under the same view but
 * dispatched through the article harvester downstream, so we just
 * forward their permalink alongside the posts.
 */

import type { ListHarvestArgs, ListHarvestResult } from "./list-types";

export function redditSavedUrl(handle: string): string {
  return `https://old.reddit.com/user/${encodeURIComponent(handle)}/saved/`;
}

export function buildRedditListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageRedditList.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageRedditList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/account/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds.map(String));

  function collect(): Array<{
    sourceId: string;
    url: string;
    savedAt?: string;
  }> {
    const out: Array<{ sourceId: string; url: string; savedAt?: string }> = [];
    const seen = new Set<string>();
    const things = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".thing[data-fullname], div[data-fullname]",
      ),
    );
    for (const node of things) {
      const fullname = node.getAttribute("data-fullname");
      if (!fullname) continue;
      if (seen.has(fullname)) continue;
      seen.add(fullname);
      const permalink =
        node.getAttribute("data-permalink") ||
        node
          .querySelector<HTMLAnchorElement>("a.bylink, a.comments")
          ?.getAttribute("href") ||
        null;
      if (!permalink) continue;
      const url = permalink.startsWith("http")
        ? permalink
        : `https://www.reddit.com${permalink}`;
      const time = node.querySelector<HTMLTimeElement>("time[datetime]");
      const savedAt = time?.getAttribute("datetime") ?? undefined;
      out.push({ sourceId: fullname, url, ...(savedAt ? { savedAt } : {}) });
    }
    return out;
  }

  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector(".thing[data-fullname]")) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const collected = new Map<
    string,
    { sourceId: string; url: string; savedAt?: string }
  >();
  function ingest(
    rows: Array<{ sourceId: string; url: string; savedAt?: string }>,
  ) {
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

  // Old-Reddit paginates with a `<a rel="nofollow next">` link rather
  // than virtualised scroll. Walk the next button until empty.
  const navDeadline = Date.now() + 60_000;
  while (Date.now() < navDeadline) {
    const next = document.querySelector<HTMLAnchorElement>(
      "span.next-button > a[rel~='nofollow next'], a[rel*='next']",
    );
    if (!next) break;
    next.click();
    await new Promise((r) => setTimeout(r, 1500));
    const { full } = ingest(collect());
    if (full) {
      return {
        ok: true,
        entries: Array.from(collected.values()),
        reachedEnd: false,
      };
    }
  }
  return {
    ok: true,
    entries: Array.from(collected.values()),
    reachedEnd: true,
  };
}
