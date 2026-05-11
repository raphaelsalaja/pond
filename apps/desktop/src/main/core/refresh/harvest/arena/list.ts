/// <reference lib="dom" />

/**
 * Are.na list collector. Scrolls the user's channels index and
 * collects block IDs using the shared scroll scaffold.
 */

import type { MediaType } from "@pond/schema/db";
import { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageArenaNormalize } from "./normalize";

export function arenaProfileUrl(slug: string): string {
  return `https://www.are.na/${encodeURIComponent(slug)}/blocks`;
}

export function buildArenaListExpression(args: ListHarvestArgs): string {
  const scrollSrc = `(${inPageScrollCollect.toString()})()`;
  const normSrc = `(${inPageArenaNormalize.toString()})()`;
  const fnSrc = `(${inPageArenaList.toString()})`;
  return `(async () => {
    const scroll = ${scrollSrc};
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, scroll, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageArenaList(
  args: ListHarvestArgs,
  scroll: ReturnType<typeof inPageScrollCollect>,
  _norm: ReturnType<typeof inPageArenaNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/log-in") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/auth")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      title?: string;
      description?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
    }> = [];
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

      const card =
        a.closest("[class*='Block'], [class*='block']") ?? a.parentElement;
      const titleEl = (card ?? a).querySelector<HTMLElement>(
        "[class*='BlockTitle'], [class*='block__title'], [class*='title']",
      );
      const title = titleEl?.textContent?.trim() || undefined;
      const img = (card ?? a).querySelector<HTMLImageElement>("img");
      const src = img?.src ?? img?.currentSrc ?? undefined;
      const mediaUrl = src && !src.startsWith("data:") ? src : undefined;

      out.push({
        sourceId: id,
        url: `https://www.are.na/block/${id}`,
        title,
        mediaUrl,
        mediaType: mediaUrl ? "image" : undefined,
      });
    }
    return out;
  }

  // Are.na's blocks index paginates via a "Load more" button rather
  // than infinite scroll. CSS has no `:has-text()` selector, so we
  // hand the scaffold a `nextFinder` callback that matches by visible
  // text instead of a static class — Are.na churns class hashes
  // between releases, so text is the most stable anchor we have.
  const findLoadMore = (): HTMLElement | null => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[role='button'], a"),
    );
    return (
      candidates.find((el) => {
        const t = (el.textContent ?? "").trim().toLowerCase();
        return t === "load more" || t === "load more blocks";
      }) ?? null
    );
  };

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    maxItems: args.maxItems,
    hydrateSelector: 'a[href*="/block/"]',
    scrollBehavior: "click-next",
    nextFinder: findLoadMore,
    nextDelayMs: 1_500,
  });
}
