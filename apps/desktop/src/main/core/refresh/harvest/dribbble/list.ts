/// <reference lib="dom" />

import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";

declare global {
  var __pondHarvestAbort: boolean | undefined;
  var __pondHarvestCursor: string | null | undefined;
}

interface LikesProgress {
  phase: string;
  collected: number;
  fresh: number;
  page: number;
}

interface LikesWalkArgs extends ListHarvestArgs {
  perPage: number;
  maxPages: number;
}

const PER_PAGE = 24;
const MAX_PAGES = 120;

export function dribbbleLikesUrl(handle: string): string {
  return `https://dribbble.com/${encodeURIComponent(handle)}/likes`;
}

export function buildDribbbleListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageDribbbleLikes.toString()})`;
  const enriched: LikesWalkArgs = {
    ...args,
    perPage: PER_PAGE,
    maxPages: MAX_PAGES,
  };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/** Fetches the same HTML fragments Dribbble's infinite scroll loads, a page of 24 at a time, newest like first. */
async function inPageDribbbleLikes(
  args: LikesWalkArgs,
): Promise<ListHarvestResult> {
  if (/^\/(?:session|signup)/.test(location.pathname)) {
    return { ok: false, reason: "auth_required" };
  }
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const entries: Array<ListEntry> = [];
  const seen = new Set<string>();
  const resumed = Number(args.resumeCursor);
  const firstPage = Number.isInteger(resumed) && resumed > 1 ? resumed : 1;
  let fresh = 0;
  let knownStreak = 0;

  function report(phase: string, page: number): void {
    const stats: LikesProgress = {
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

  /** Thumbnails ask the CDN for a resized copy; without these params it serves the upload. */
  function original(src: string): string {
    try {
      const url = new URL(src, location.origin);
      for (const key of ["resize", "format", "vertical"]) {
        url.searchParams.delete(key);
      }
      return url.toString();
    } catch {
      return src;
    }
  }

  /** The bot wall answers 202 while it wants a fresh token; the site's own scroll retries with a growing delay. */
  async function fetchPage(
    page: number,
  ): Promise<string | "auth" | "rate_limited" | null> {
    let delay = 600;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(
        `${location.pathname}?page=${page}&per_page=${args.perPage}`,
        {
          credentials: "include",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            accept: "text/html",
          },
        },
      );
      if (res.status === 202) {
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
        delay += 400;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        return "auth";
      }
      if (res.status === 429) {
        return "rate_limited";
      }
      return res.ok ? res.text() : null;
    }
    return "rate_limited";
  }

  function readShot(li: HTMLLIElement): ListEntry | null {
    const id = li.dataset.thumbnailId;
    if (!id || !/^\d+$/.test(id)) {
      return null;
    }
    const href = li
      .querySelector("a.shot-thumbnail-link")
      ?.getAttribute("href");
    const entry: ListEntry = {
      sourceId: id,
      url: href
        ? new URL(href, location.origin).toString()
        : `https://dribbble.com/shots/${id}`,
    };
    const title =
      li.querySelector(".shot-title")?.textContent?.trim() ||
      li
        .querySelector("a.shot-thumbnail-link .accessibility-text")
        ?.textContent?.trim()
        .replace(/^View\s+/, "");
    if (title) {
      entry.title = title;
    }
    const author = li
      .querySelector(".user-information .display-name")
      ?.textContent?.trim();
    if (author) {
      entry.author = author;
    }
    const img = li.querySelector<HTMLImageElement>("figure img");
    const raw = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
    const still = raw && !raw.startsWith("data:") ? original(raw) : "";
    const video =
      img?.getAttribute("data-animated-url") ||
      li
        .querySelector(".js-thumbnail-base.video")
        ?.getAttribute("data-video-teaser-large");
    if (video) {
      entry.mediaUrl = video;
      entry.mediaUrls = [
        still
          ? { url: video, type: "video", poster: still }
          : { url: video, type: "video" },
      ];
      entry.mediaType = "video";
    } else if (still) {
      entry.mediaUrl = still;
      entry.mediaUrls = [{ url: still, type: "image" }];
      entry.mediaType = "image";
    } else {
      entry.mediaType = "link";
    }
    entry.listKinds = ["liked"];
    return entry;
  }

  globalThis.__pondHarvestCursor = String(firstPage);
  for (let page = firstPage; page < firstPage + args.maxPages; page++) {
    if (globalThis.__pondHarvestAbort) {
      report("aborted", page);
      return unfinished(page);
    }
    const html = await fetchPage(page);
    if (html === "auth") {
      return { ok: false, reason: "auth_required" };
    }
    if (html === "rate_limited" || html === null) {
      if (page > firstPage) {
        return unfinished(page);
      }
      return { ok: false, reason: html ?? "unknown" };
    }
    const doc = new DOMParser().parseFromString(
      `<ol>${html}</ol>`,
      "text/html",
    );
    const items = Array.from(
      doc.querySelectorAll<HTMLLIElement>("li.js-thumbnail[data-thumbnail-id]"),
    );
    let pageFresh = 0;
    for (const li of items) {
      const entry = readShot(li);
      if (!entry || seen.has(entry.sourceId)) {
        continue;
      }
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

    if (earlyStop && items.length > 0 && pageFresh === 0) {
      knownStreak += 1;
      if (knownStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownStreak = 0;
    }
    if (items.length < args.perPage) {
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 900 + Math.random() * 400);
    });
  }
  return unfinished(firstPage + args.maxPages);
}
