import { browserValidationSource } from "../lib/browser-validation-source";
/// <reference lib="dom" />

import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import {
  type InstagramEntry,
  type InstagramMediaNode,
  inPageInstagramNormalize,
} from "./normalize";

declare global {
  var __pondHarvestAbort: boolean | undefined;
  var __pondHarvestCursor: string | null | undefined;
}

type FeedItem = InstagramMediaNode & {
  media?: InstagramMediaNode;
  timestamp?: number;
};

interface SavedFeedPage {
  items?: FeedItem[];
  feed_items?: FeedItem[];
  more_available?: boolean;
  next_max_id?: string | number;
  require_login?: boolean;
  message?: string;
}

interface ListProgress {
  phase: string;
  collected: number;
  fresh: number;
  path: string;
  earlyStop?: boolean;
  known?: number;
  page?: number;
  cursor?: string | null;
  status?: number;
  error?: string;
  items?: number;
  pageNorm?: number;
  pageFresh?: number;
  more?: boolean;
  capped?: boolean;
}

type ListProgressExtra = Omit<
  ListProgress,
  "phase" | "collected" | "fresh" | "path"
> & { path?: string };

export const INSTAGRAM_HOME_URL = "https://www.instagram.com/";

export interface InstagramListArgs extends ListHarvestArgs {
  /** Walks one saved collection instead of every saved post. */
  collectionId?: string;
}

export function buildInstagramListExpression(args: InstagramListArgs): string {
  const normSrc = `(${inPageInstagramNormalize.toString()})(validators)`;
  const fnSrc = `(${inPageInstagramList.toString()})`;
  return `(async () => {
    ${browserValidationSource}
    const validators = PondHarvestValidation.browserValidators;
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageInstagramList(
  args: InstagramListArgs,
  norm: ReturnType<typeof inPageInstagramNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/accounts/login") ||
    location.pathname.startsWith("/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  const apiResult = await fetchSavedViaApi();
  if (apiResult) return apiResult;
  if (args.collectionId) return { ok: false, reason: "no_match" };
  return await fallbackDomScroll();

  async function fetchSavedViaApi(): Promise<ListHarvestResult | null> {
    const collection = args.collectionId
      ? `/api/v1/feed/collection/${encodeURIComponent(args.collectionId)}`
      : null;
    let path = collection
      ? `${collection}/posts/`
      : "/api/v1/feed/saved/posts/";
    const entries: InstagramEntry[] = [];
    let cursor = args.resumeCursor;
    let resuming = cursor !== undefined;
    let pagesRead = 0;
    globalThis.__pondHarvestCursor = cursor ?? null;
    const known = new Set(args.knownIds.map(String));
    const earlyStopEnabled = args.earlyStop ?? known.size > 0;
    let knownPageStreak = 0;
    const STOP_AFTER_KNOWN_PAGES = 2;
    let freshCount = 0;

    function checkpoint(): void {
      Object.assign(globalThis, {
        __pondHarvestPartial: entries.map((e) => ({
          sourceId: e.sourceId,
          url: e.url,
          savedAt: e.savedAt,
        })),
      });
    }

    function reportProgress(phase: string, extra: ListProgressExtra = {}) {
      const stats: ListProgress = {
        phase,
        collected: entries.length,
        fresh: freshCount,
        earlyStop: earlyStopEnabled,
        known: known.size,
        ...extra,
        path: extra.path ?? location.pathname,
      };
      Object.assign(globalThis, { __pondHarvestStats: stats });
    }

    function unfinished(): ListHarvestResult {
      return cursor
        ? { ok: true, entries, reachedEnd: false, resumeCursor: cursor }
        : { ok: true, entries, reachedEnd: false };
    }

    /** A stored cursor can expire between runs; read the list from the top instead. */
    function restartFromTop(): boolean {
      if (!resuming || pagesRead > 0) return false;
      resuming = false;
      cursor = undefined;
      globalThis.__pondHarvestCursor = null;
      return true;
    }

    reportProgress("connecting", {});

    for (let page = 0; page < 200; page++) {
      if (globalThis.__pondHarvestAbort) {
        reportProgress("aborted", { page });
        checkpoint();
        return unfinished();
      }

      const url = cursor ? `${path}?max_id=${cursor}` : path;

      reportProgress("api_fetch", { page, cursor: cursor ?? null, path });

      let json: SavedFeedPage;
      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "x-ig-app-id": "936619743392459",
            "x-asbd-id": "129477",
            "x-requested-with": "XMLHttpRequest",
            accept: "*/*",
          },
        });

        reportProgress("api_response", { page, status: res.status });

        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: "auth_required" };
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const n = retryAfter ? Number(retryAfter) : Number.NaN;
          const limited: Extract<ListHarvestResult, { ok: false }> = {
            ok: false,
            reason: "rate_limited",
          };
          if (Number.isFinite(n)) limited.retryAfterSec = Math.max(0, n);
          return limited;
        }
        if (!res.ok) {
          reportProgress("api_not_ok", { page, status: res.status, path });
          /** Older web builds serve a collection's posts without the `/posts/` suffix. */
          if (collection && pagesRead === 0 && path !== `${collection}/`) {
            path = `${collection}/`;
            continue;
          }
          if (restartFromTop()) continue;
          return null;
        }

        json = await res.json();
      } catch (err) {
        reportProgress("api_error", {
          page,
          error: err instanceof Error ? err.name : "error",
        });
        if (restartFromTop()) continue;
        return null;
      }

      if (json?.require_login || json?.message === "login_required") {
        return { ok: false, reason: "auth_required" };
      }

      const items = json?.items ?? json?.feed_items ?? [];
      if (items.length === 0 && pagesRead === 0) {
        reportProgress("api_empty", { page, path });
        if (restartFromTop()) continue;
        return null;
      }
      pagesRead += 1;

      let pageFresh = 0;
      let pageNorm = 0;
      for (const item of items) {
        const entry = norm.normalizeMediaNode(item.media ?? item, {
          savedTimestamp: item.timestamp,
        });
        if (!entry) continue;
        pageNorm += 1;
        if (!known.has(entry.sourceId)) {
          pageFresh += 1;
          freshCount += 1;
        }
        entries.push(entry);
      }

      checkpoint();
      reportProgress("fetching", {
        page,
        items: items.length,
        pageNorm,
        pageFresh,
        more: json?.more_available === true,
      });

      if (earlyStopEnabled && items.length > 0 && pageFresh === 0) {
        knownPageStreak += 1;
        if (knownPageStreak >= STOP_AFTER_KNOWN_PAGES) {
          reportProgress("done", { page, earlyStop: true });
          return { ok: true, entries, reachedEnd: true };
        }
      } else {
        knownPageStreak = 0;
      }

      const moreAvailable = json?.more_available === true;
      const nextCursor = json?.next_max_id;

      if (!moreAvailable || !nextCursor) {
        reportProgress("done", { page, earlyStop: false });
        return { ok: true, entries, reachedEnd: true };
      }

      cursor = String(nextCursor);
      globalThis.__pondHarvestCursor = cursor;
      await new Promise((r) => setTimeout(r, 250));
    }

    reportProgress("done", { page: 199, capped: true });
    checkpoint();
    return unfinished();
  }

  async function fallbackDomScroll(): Promise<ListHarvestResult> {
    globalThis.__pondHarvestCursor = null;
    const stats: ListProgress = {
      phase: "dom_fallback",
      collected: 0,
      fresh: 0,
      path: location.pathname,
    };
    Object.assign(globalThis, { __pondHarvestStats: stats });
    const _known = new Set(args.knownIds.map(String));

    type StubEntry = {
      sourceId: string;
      url: string;
      listKinds?: Array<"liked" | "saved">;
    };

    function collect(): StubEntry[] {
      const out: StubEntry[] = [];
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
        } catch {}
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          sourceId: id,
          url: `https://www.instagram.com/${kind}/${id}/`,
          listKinds: ["saved"],
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

    const collected = new Map<string, StubEntry>();
    function ingestRows(rows: StubEntry[]): void {
      for (const r of rows) {
        if (!collected.has(r.sourceId)) collected.set(r.sourceId, r);
      }
    }

    ingestRows(collect());

    const scrollDeadline = Date.now() + 60_000;
    let lastHeight = document.documentElement.scrollHeight;
    let stable = 0;
    while (Date.now() < scrollDeadline) {
      window.scrollBy({ top: window.innerHeight * 0.9, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 700));
      ingestRows(collect());
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
}
