/// <reference lib="dom" />

import type { BrowserValidators } from "../lib/browser-validation";
import { browserValidationSource } from "../lib/browser-validation-source";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import { inPageUnsplashNormalize } from "./normalize";

declare global {
  var __pondHarvestAbort: boolean | undefined;
  var __pondHarvestCursor: string | null | undefined;
}

interface BookmarksProgress {
  phase: string;
  collected: number;
  fresh: number;
  page: number;
}

interface BookmarksWalkArgs extends ListHarvestArgs {
  perPage: number;
  maxPages: number;
}

export const UNSPLASH_LIST_URL = "https://unsplash.com/bookmarks";

const PER_PAGE = 20;
const MAX_PAGES = 100;

export function buildUnsplashListExpression(args: ListHarvestArgs): string {
  const normSrc = `(${inPageUnsplashNormalize.toString()})(validators)`;
  const fnSrc = `(${inPageUnsplashBookmarks.toString()})`;
  const enriched: BookmarksWalkArgs = {
    ...args,
    perPage: PER_PAGE,
    maxPages: MAX_PAGES,
  };
  return `(async () => {
    ${browserValidationSource}
    const validators = PondHarvestValidation.browserValidators;
    const norm = ${normSrc};
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args, validators, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/** Reads the same `/napi/me/bookmarks` pages the Bookmarks screen loads; the `/napi` proxy turns the session cookie into a token. */
async function inPageUnsplashBookmarks(
  args: BookmarksWalkArgs,
  validators: BrowserValidators,
  norm: ReturnType<typeof inPageUnsplashNormalize>,
): Promise<ListHarvestResult> {
  if (/^\/(?:login|join)/.test(location.pathname)) {
    return { ok: false, reason: "auth_required" };
  }
  const get = (path: string): Promise<Response> =>
    fetch(path, {
      credentials: "include",
      headers: { accept: "application/json" },
    });

  const me = await get("/napi/me");
  if (me.status === 429) return { ok: false, reason: "rate_limited" };
  if (!me.ok) return { ok: false, reason: "auth_required" };

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const entries: Array<ListEntry> = [];
  const seen = new Set<string>();
  const resumed = Number(args.resumeCursor);
  const firstPage = Number.isInteger(resumed) && resumed > 1 ? resumed : 1;
  let fresh = 0;
  let knownStreak = 0;

  function report(phase: string, page: number): void {
    const stats: BookmarksProgress = {
      phase,
      collected: entries.length,
      fresh,
      page,
    };
    Object.assign(globalThis, { __pondHarvestStats: stats });
  }

  function unfinished(page: number): ListHarvestResult {
    return {
      ok: true,
      entries,
      reachedEnd: false,
      seen: entries.length,
      resumeCursor: String(page),
    };
  }

  function finished(): ListHarvestResult {
    return firstPage === 1
      ? {
          ok: true,
          entries,
          reachedEnd: true,
          seen: entries.length,
          complete: true,
        }
      : { ok: true, entries, reachedEnd: true, seen: entries.length };
  }

  globalThis.__pondHarvestCursor = String(firstPage);
  let read = (firstPage - 1) * args.perPage;
  for (let page = firstPage; page < firstPage + args.maxPages; page++) {
    if (globalThis.__pondHarvestAbort) {
      report("aborted", page);
      return unfinished(page);
    }
    const res = await get(
      `/napi/me/bookmarks?page=${page}&per_page=${args.perPage}`,
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    if (!res.ok) {
      if (page > firstPage) return unfinished(page);
      return {
        ok: false,
        reason: res.status === 429 ? "rate_limited" : "unknown",
      };
    }
    const body: unknown = await res.json();
    const parsed = validators.unsplashBookmarks.safeParse(body);
    if (!parsed.success) {
      if (page > firstPage) return unfinished(page);
      return { ok: false, reason: "unknown" };
    }
    const { total, results } = parsed.data;
    if (results.length === 0) return finished();
    read += results.length;

    let pageFresh = 0;
    for (const asset of results) {
      if (!asset) continue;
      const entry = norm.assetEntry(asset);
      if (seen.has(entry.sourceId)) continue;
      seen.add(entry.sourceId);
      if (!known.has(entry.sourceId)) {
        fresh += 1;
        pageFresh += 1;
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
    globalThis.__pondHarvestCursor = String(page + 1);
    report("page", page);

    if (total !== undefined && read >= total) return finished();
    if (earlyStop && pageFresh === 0) {
      knownStreak += 1;
      if (knownStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownStreak = 0;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 700 + Math.random() * 300);
    });
  }
  return unfinished(firstPage + args.maxPages);
}
