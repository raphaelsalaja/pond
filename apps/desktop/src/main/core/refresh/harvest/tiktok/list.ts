/// <reference lib="dom" />

/**
 * TikTok favourites list collector. Scrolls the user's profile page
 * and collects video IDs using the shared scroll scaffold.
 */

import type { MediaType } from "@pond/schema/db";
import { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageTiktokNormalize } from "./normalize";

export function tiktokFavouritesUrl(handle: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

export function buildTiktokListExpression(args: ListHarvestArgs): string {
  const scrollSrc = `(${inPageScrollCollect.toString()})()`;
  const normSrc = `(${inPageTiktokNormalize.toString()})()`;
  const fnSrc = `(${inPageTiktokList.toString()})`;
  return `(async () => {
    const scroll = ${scrollSrc};
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, scroll, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageTiktokList(
  args: ListHarvestArgs,
  scroll: ReturnType<typeof inPageScrollCollect>,
  norm: ReturnType<typeof inPageTiktokNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.includes("/business")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  // The profile route (`/@<handle>`) lands on the "Videos" tab,
  // which for most users is empty — Favorites is a sibling tab on
  // the same page, backed by `/api/user/collect/item_list/`. We
  // click it before handing off to the shared scroll scaffold so the
  // `a[href*="/video/"]` hydrate selector actually matches.
  const findFavoritesTab = (): HTMLElement | null => {
    const direct = document.querySelector<HTMLElement>(
      '[data-e2e="favorites-tab"], [data-e2e="favorite-tab"]',
    );
    if (direct) return direct;
    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[role="tab"], a[role="tab"], [role="tab"]',
      ),
    );
    return (
      tabs.find((el) => {
        const t = (el.textContent ?? "").trim().toLowerCase();
        return t === "favorites" || t === "favourites";
      }) ?? null
    );
  };

  const tabDeadline = Date.now() + 8_000;
  let favTab: HTMLElement | null = null;
  while (Date.now() < tabDeadline) {
    favTab = findFavoritesTab();
    if (favTab) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (favTab) {
    favTab.click();
    // Give TikTok a beat to swap tab contents before the shared
    // scroll scaffold starts polling `hydrateSelector`. Without
    // this the first scroll fires against the Videos grid.
    await new Promise((r) => setTimeout(r, 1_500));
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      title?: string;
      author?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
    }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'),
    );
    for (const a of links) {
      const id = norm.extractVideoId(a.href);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      let pathname = "";
      try {
        pathname = new URL(a.href, location.origin).pathname;
      } catch {
        /* unparseable */
      }

      const card =
        a.closest(
          "[class*='DivItemContainer'], [class*='video-feed'], [data-e2e]",
        ) ?? a.parentElement;
      const img = (card ?? a).querySelector<HTMLImageElement>("img");
      const src = img?.src ?? img?.currentSrc ?? undefined;
      const mediaUrl = src && !src.startsWith("data:") ? src : undefined;
      const desc = card?.querySelector<HTMLElement>(
        "[data-e2e='video-desc'], [class*='video-meta-caption']",
      );
      const title = desc?.textContent?.trim() || undefined;
      const handleSegs = pathname.split("/").filter(Boolean);
      const author = handleSegs[0]?.startsWith("@") ? handleSegs[0] : undefined;

      out.push({
        sourceId: id,
        url: `https://www.tiktok.com${pathname}`,
        title,
        author,
        mediaUrl,
        mediaType: "video",
      });
    }
    return out;
  }

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    maxItems: args.maxItems,
    hydrateSelector: 'a[href*="/video/"]',
  });
}
