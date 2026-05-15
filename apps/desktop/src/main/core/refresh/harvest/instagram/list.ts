/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageInstagramNormalize } from "./normalize";

export function buildInstagramListExpression(args: ListHarvestArgs): string {
  const normSrc = `(${inPageInstagramNormalize.toString()})()`;
  const fnSrc = `(${inPageInstagramList.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageInstagramList(
  args: ListHarvestArgs,
  norm: ReturnType<typeof inPageInstagramNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/accounts/login") ||
    location.pathname.startsWith("/login")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  type Entry = {
    sourceId: string;
    url: string;
    savedAt?: string;
    title?: string;
    description?: string;
    author?: string;
    mediaUrl?: string;
    mediaUrls?: Array<{ url: string; type?: MediaType; poster?: string }>;
    mediaType?: MediaType;
    meta?: Record<string, unknown>;
  };

  const apiResult = await fetchSavedViaApi();
  if (apiResult) return apiResult;
  return await fallbackDomScroll();

  async function fetchSavedViaApi(): Promise<ListHarvestResult | null> {
    const entries: Entry[] = [];
    let cursor: string | undefined;
    const known = new Set(args.knownIds.map(String));

    function reportProgress(phase: string) {
      (globalThis as any).__pondHarvestStats = {
        phase,
        collected: entries.length,
        fresh: entries.filter((e) => !known.has(e.sourceId)).length,
      };
    }

    reportProgress("connecting");

    for (let page = 0; page < 200; page++) {
      const url = cursor
        ? `/api/v1/feed/saved/posts/?max_id=${cursor}`
        : "/api/v1/feed/saved/posts/";

      let json: any;
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

        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: "auth_required" };
        }
        if (!res.ok) return null;

        json = await res.json();
      } catch {
        return null;
      }

      if (json?.require_login || json?.message === "login_required") {
        return { ok: false, reason: "auth_required" };
      }

      const items: any[] = json?.items ?? [];
      if (items.length === 0 && page === 0) return null;

      for (const item of items) {
        const raw = norm.normalizeMediaNode(item?.media, {
          savedTimestamp: item?.timestamp,
        });
        if (!raw) continue;
        entries.push(raw as Entry);
      }

      reportProgress("fetching");

      const moreAvailable = json?.more_available === true;
      const nextCursor = json?.next_max_id;

      if (!moreAvailable || !nextCursor) {
        reportProgress("done");
        return { ok: true, entries, reachedEnd: true };
      }

      cursor = String(nextCursor);
      await new Promise((r) => setTimeout(r, 500));
    }

    return { ok: true, entries, reachedEnd: false };
  }

  async function fallbackDomScroll(): Promise<ListHarvestResult> {
    const _known = new Set(args.knownIds.map(String));

    type StubEntry = { sourceId: string; url: string };

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
      window.scrollBy({
        top: window.innerHeight * 0.9,
        behavior: "instant" as ScrollBehavior,
      });
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
