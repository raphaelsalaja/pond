/// <reference lib="dom" />

import type { ListHarvestArgs, ListHarvestResult } from "../list-types";

declare global {
  var __pondHarvestAbort: boolean | undefined;
  var __pondHarvestCursor: string | null | undefined;
}

interface StarEntry {
  sourceId: string;
  url: string;
  title: string;
  description?: string;
  author: string;
}

interface StarProgress {
  phase: string;
  collected: number;
  fresh: number;
  page: number;
}

export function githubStarsUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}?tab=stars`;
}

export function buildGithubStarsExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageGithubStars.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/** Walks the Stars tab newest first, 30 repos a page, fetching each next page in your session. */
async function inPageGithubStars(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  if (location.pathname.startsWith("/login")) {
    return { ok: false, reason: "auth_required" };
  }

  const MAX_PAGES = 200;
  const PAGE_DELAY_MS = 600;
  const REPO_PATH = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/?$/;
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<StarEntry> = [];
  const seen = new Set<string>();
  let fresh = 0;
  let cursor: string | null = args.resumeCursor ?? null;
  let fromTop = cursor === null;
  globalThis.__pondHarvestCursor = cursor;

  function report(phase: string, page: number): void {
    const stats: StarProgress = {
      phase,
      collected: entries.length,
      fresh,
      page,
    };
    Object.assign(globalThis, { __pondHarvestStats: stats });
  }

  function unfinished(): ListHarvestResult {
    return cursor
      ? { ok: true, entries, reachedEnd: false, resumeCursor: cursor }
      : { ok: true, entries, reachedEnd: false };
  }

  /** The cursor is base64 msgpack holding the last star's time on the page it ends. */
  function cursorTime(after: string): number {
    try {
      const decoded = atob(decodeURIComponent(after));
      const stamp = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.exec(decoded)?.[0];
      return stamp ? Date.parse(stamp) : Number.NaN;
    } catch {
      return Number.NaN;
    }
  }

  function readPage(
    doc: Document,
  ): { rows: Array<StarEntry>; next: string | null } | null {
    const list = doc.querySelector("#user-starred-repos");
    if (!list) {
      return null;
    }
    const rows: Array<StarEntry> = [];
    for (const link of list.querySelectorAll<HTMLAnchorElement>("h3 > a")) {
      const path = REPO_PATH.exec(link.getAttribute("href") ?? "");
      if (!path?.[1] || !path[2]) {
        continue;
      }
      const name = `${path[1]}/${path[2]}`;
      const row = link.closest("div.col-12") ?? link.parentElement;
      const about = row
        ?.querySelector('[itemprop="description"]')
        ?.textContent?.trim();
      const entry: StarEntry = {
        sourceId: name.toLowerCase(),
        url: `https://github.com/${name.toLowerCase()}`,
        title: name,
        author: path[1],
      };
      if (about) {
        entry.description = about;
      }
      rows.push(entry);
    }
    const next = Array.from(
      list.querySelectorAll<HTMLAnchorElement>(".paginate-container a[href]"),
    )
      .map((a) =>
        new URL(a.getAttribute("href") ?? "", location.origin).searchParams.get(
          "after",
        ),
      )
      .find((after): after is string => Boolean(after));
    return { rows, next: next ?? null };
  }

  async function load(
    after: string,
  ): Promise<Document | "rate_limited" | null> {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("tab", "stars");
    url.searchParams.set("after", after);
    try {
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.status === 429) {
        return "rate_limited";
      }
      if (!res.ok) {
        return null;
      }
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch {
      return null;
    }
  }

  let doc: Document = document;
  if (cursor) {
    const resumed = await load(cursor);
    if (resumed === "rate_limited") {
      return { ok: false, reason: "rate_limited" };
    }
    if (resumed) {
      doc = resumed;
    } else {
      /** A stored cursor can expire between runs; read the list from the top instead. */
      cursor = null;
      fromTop = true;
      globalThis.__pondHarvestCursor = null;
    }
  }

  for (let page = 0; page < MAX_PAGES; page++) {
    if (globalThis.__pondHarvestAbort) {
      report("aborted", page);
      return unfinished();
    }
    const read = readPage(doc);
    if (!read) {
      return page === 0 ? { ok: false, reason: "no_match" } : unfinished();
    }
    let pageFresh = 0;
    for (const row of read.rows) {
      if (seen.has(row.sourceId)) {
        continue;
      }
      seen.add(row.sourceId);
      if (!known.has(row.sourceId)) {
        fresh += 1;
        pageFresh += 1;
      }
      entries.push(row);
    }
    cursor = read.next;
    Object.assign(globalThis, {
      __pondHarvestPartial: entries.map((e) => ({
        sourceId: e.sourceId,
        url: e.url,
      })),
    });
    globalThis.__pondHarvestCursor = cursor;
    report("page", page);

    if (earlyStop && read.rows.length > 0 && pageFresh === 0) {
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    if (!read.next) {
      return {
        ok: true,
        entries,
        reachedEnd: true,
        seen: entries.length,
        complete: fromTop,
      };
    }
    /** Stars carry no date of their own, so the limit lands on the page whose last star predates it. */
    if (cursorTime(read.next) < since) {
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }

    await new Promise((resolve) => {
      setTimeout(resolve, PAGE_DELAY_MS);
    });
    const next = await load(read.next);
    if (next === "rate_limited") {
      return entries.length > 0
        ? unfinished()
        : { ok: false, reason: "rate_limited" };
    }
    if (!next) {
      return unfinished();
    }
    doc = next;
  }
  return unfinished();
}
