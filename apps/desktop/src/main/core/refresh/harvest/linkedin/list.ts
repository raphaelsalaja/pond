/// <reference lib="dom" />

import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import { inPageLinkedInNormalize } from "./normalize";
import type { VoyagerClusterReply } from "./normalize";

declare global {
  var __pondHarvestAbort: boolean | undefined;
  var __pondHarvestCursor: string | null | undefined;
}

interface SavedPostsProgress {
  phase: string;
  collected: number;
  fresh: number;
  start: number;
}

interface SavedPostsWalkArgs extends ListHarvestArgs {
  maxPages: number;
  /** Polls every half second, so the page's own request has time to fire. */
  discoverTries: number;
  pageDelayMs: number;
}

type SavedPostsFetch =
  | { kind: "page"; reply: VoyagerClusterReply }
  | { kind: "auth" }
  | { kind: "checkpoint" }
  | { kind: "failed" }
  | { kind: "rate_limited"; retryAfterSec: number | null };

export const LINKEDIN_LIST_URL =
  "https://www.linkedin.com/my-items/saved-posts/";

const MAX_PAGES = 60;
const DISCOVER_TRIES = 30;
/** LinkedIn restricts accounts that page its private API quickly, so each page waits longer than other sources. */
const PAGE_DELAY_MS = 2500;

export function buildLinkedInListExpression(args: ListHarvestArgs): string {
  const normSrc = `(${inPageLinkedInNormalize.toString()})()`;
  const fnSrc = `(${inPageLinkedInSavedPosts.toString()})`;
  const enriched: SavedPostsWalkArgs = {
    ...args,
    maxPages: MAX_PAGES,
    discoverTries: DISCOVER_TRIES,
    pageDelayMs: PAGE_DELAY_MS,
  };
  return `(async () => {
    const norm = ${normSrc};
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/** Replays the saved-posts query the My items page sends; its query id changes with each LinkedIn deploy. */
async function inPageLinkedInSavedPosts(
  args: SavedPostsWalkArgs,
  norm: ReturnType<typeof inPageLinkedInNormalize>,
): Promise<ListHarvestResult> {
  const CHECKPOINT = /^\/(?:checkpoint|challenge)/;
  const SIGNED_OUT = /^\/(?:authwall|login|uas\/login|signup)/;
  const SAVED_QUERY = "SEARCH_MY_ITEMS_SAVED_POSTS";
  const RESULT = "[data-chameleon-result-urn]";

  if (CHECKPOINT.test(location.pathname)) {
    return { ok: false, reason: "auth_required", error: "checkpoint" };
  }
  if (SIGNED_OUT.test(location.pathname)) {
    return { ok: false, reason: "auth_required" };
  }

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const entries: Array<ListEntry> = [];
  const seen = new Set<string>();
  let fresh = 0;

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function isClusterReply(value: unknown): value is VoyagerClusterReply {
    return Object(value) === value;
  }

  function pause(): Promise<void> {
    return sleep(args.pageDelayMs + Math.random() * 1500);
  }

  function report(phase: string, start: number): void {
    const stats: SavedPostsProgress = {
      phase,
      collected: entries.length,
      fresh,
      start,
    };
    Object.assign(globalThis, { __pondHarvestStats: stats });
  }

  function ingest(rows: Array<ListEntry>): number {
    let added = 0;
    for (const entry of rows) {
      if (seen.has(entry.sourceId)) {
        continue;
      }
      seen.add(entry.sourceId);
      if (!known.has(entry.sourceId)) {
        fresh += 1;
        added += 1;
      }
      entries.push(entry);
    }
    Object.assign(globalThis, {
      __pondHarvestPartial: entries.map((e) => ({
        sourceId: e.sourceId,
        url: e.url,
        listKinds: e.listKinds,
      })),
    });
    return added;
  }

  function checkpoint(): ListHarvestResult {
    return { ok: false, reason: "auth_required", error: "checkpoint" };
  }

  function stopped(reachedEnd: boolean): ListHarvestResult {
    return { ok: true, entries, reachedEnd, seen: entries.length };
  }

  function unfinished(start: number): ListHarvestResult {
    return {
      ok: true,
      entries,
      reachedEnd: false,
      seen: entries.length,
      resumeCursor: String(start),
    };
  }

  /** Only a walk from the first save that read posts may drop missing ones from Saved. */
  function finished(first: number): ListHarvestResult {
    if (first > 0 || entries.length === 0) {
      return stopped(true);
    }
    return {
      ok: true,
      entries,
      reachedEnd: true,
      seen: entries.length,
      complete: true,
    };
  }

  /** The page either fetched the query already or inlined its reply in a `<code>` datalet. */
  function findSavedQuery(): string | null {
    const urls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name);
    for (const code of Array.from(document.querySelectorAll("code"))) {
      const match = /"request":"([^"]+)"/.exec(code.textContent ?? "");
      if (match?.[1]) {
        urls.push(match[1].replaceAll(/\\u0026|&amp;/g, "&"));
      }
    }
    for (const url of urls) {
      if (url.includes("/voyager/api/graphql") && url.includes(SAVED_QUERY)) {
        return new URL(url, location.origin).toString();
      }
    }
    return null;
  }

  function atStart(query: string, start: number): string {
    const offset = /start(:|%3A)\d+/i;
    if (offset.test(query)) {
      return query.replace(offset, (_, sep: string) => `start${sep}${start}`);
    }
    return query.replace("variables=(", `variables=(start:${start},`);
  }

  /** Voyager rejects requests without `csrf-token`, which must echo the JSESSIONID cookie minus its quotes. */
  const csrf = /(?:^|;\s*)JSESSIONID="?([^";]+)/.exec(document.cookie)?.[1];

  async function fetchPage(
    query: string,
    start: number,
  ): Promise<SavedPostsFetch> {
    const res = await fetch(atStart(query, start), {
      credentials: "include",
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrf ?? "",
        "x-restli-protocol-version": "2.0.0",
      },
    });
    const landed = new URL(res.url || query, location.origin).pathname;
    /** LinkedIn answers 999 when it flags the session as automated. */
    if (res.status === 999 || CHECKPOINT.test(landed)) {
      return { kind: "checkpoint" };
    }
    if (res.status === 401 || res.status === 403 || SIGNED_OUT.test(landed)) {
      return { kind: "auth" };
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      return {
        kind: "rate_limited",
        retryAfterSec: retryAfter > 0 ? retryAfter : null,
      };
    }
    if (!res.ok) {
      return { kind: "failed" };
    }
    try {
      const reply: unknown = await res.json();
      return isClusterReply(reply)
        ? { kind: "page", reply }
        : { kind: "failed" };
    } catch {
      return { kind: "failed" };
    }
  }

  /** Returns null when the first page reads no posts, so the rendered list gets a look before anything is concluded. */
  async function walkQuery(query: string): Promise<ListHarvestResult | null> {
    const resumed = Number(args.resumeCursor);
    const first = Number.isInteger(resumed) && resumed > 0 ? resumed : 0;
    let start = first;
    let knownStreak = 0;
    globalThis.__pondHarvestCursor = String(start);
    for (let page = 0; page < args.maxPages; page++) {
      if (globalThis.__pondHarvestAbort) {
        report("aborted", start);
        return unfinished(start);
      }
      const fetched = await fetchPage(query, start);
      if (fetched.kind === "checkpoint") {
        return checkpoint();
      }
      if (fetched.kind === "auth") {
        return { ok: false, reason: "auth_required" };
      }
      if (fetched.kind === "rate_limited") {
        if (page > 0) {
          return unfinished(start);
        }
        return fetched.retryAfterSec === null
          ? { ok: false, reason: "rate_limited" }
          : {
              ok: false,
              reason: "rate_limited",
              retryAfterSec: fetched.retryAfterSec,
            };
      }
      if (fetched.kind === "failed") {
        return page > 0 ? unfinished(start) : null;
      }
      const { entries: rows, count, total } = norm.clusterPage(fetched.reply);
      if (page === 0 && rows.length === 0) {
        return null;
      }
      if (count === 0) {
        return finished(first);
      }
      start += count;
      globalThis.__pondHarvestCursor = String(start);
      const added = ingest(rows);
      report("page", start);
      if (total !== undefined && start >= total) {
        return finished(first);
      }
      if (earlyStop && added === 0) {
        knownStreak += 1;
        if (knownStreak >= 2) {
          return stopped(true);
        }
      } else {
        knownStreak = 0;
      }
      await pause();
    }
    return unfinished(start);
  }

  function showMore(): HTMLButtonElement | null {
    for (const button of Array.from(document.querySelectorAll("button"))) {
      const label = button.textContent?.trim() ?? "";
      if (!button.disabled && /^show more results$/i.test(label)) {
        return button;
      }
    }
    return null;
  }

  /** Reads what the page renders and presses its own "Show more results"; it can't tell the list is whole, so it never sets `complete`. */
  async function walkRendered(): Promise<ListHarvestResult> {
    globalThis.__pondHarvestCursor = null;
    for (let attempt = 0; attempt < args.discoverTries; attempt++) {
      if (document.querySelector(RESULT)) {
        break;
      }
      if (CHECKPOINT.test(location.pathname)) {
        return checkpoint();
      }
      await sleep(500);
    }
    let knownStreak = 0;
    let stalls = 0;
    for (let page = 0; page < args.maxPages; page++) {
      if (globalThis.__pondHarvestAbort) {
        report("aborted", entries.length);
        return stopped(false);
      }
      if (CHECKPOINT.test(location.pathname)) {
        return checkpoint();
      }
      const before = entries.length;
      const added = ingest(norm.renderedEntries(document));
      report("rendered", entries.length);
      if (entries.length === before) {
        stalls += 1;
        if (stalls >= 2) {
          return stopped(true);
        }
      } else {
        stalls = 0;
      }
      if (earlyStop && entries.length > before && added === 0) {
        knownStreak += 1;
        if (knownStreak >= 2) {
          return stopped(true);
        }
      } else if (added > 0) {
        knownStreak = 0;
      }
      const more = showMore();
      if (!more) {
        return stopped(true);
      }
      more.click();
      await pause();
    }
    return stopped(false);
  }

  let query: string | null = null;
  for (let attempt = 0; attempt < args.discoverTries; attempt++) {
    if (CHECKPOINT.test(location.pathname)) {
      return checkpoint();
    }
    query = findSavedQuery();
    if (query) {
      break;
    }
    await sleep(500);
  }
  if (query) {
    const result = await walkQuery(query);
    if (result) {
      return result;
    }
  }
  return walkRendered();
}
