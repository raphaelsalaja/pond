/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import { buildScrollListExpression } from "../lib/expression";
import type { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPageTiktokNormalize } from "./normalize";

export function tiktokFavouritesUrl(handle: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

export function buildTiktokListExpression(args: ListHarvestArgs): string {
  return buildScrollListExpression(
    inPageTiktokNormalize,
    inPageTiktokList,
    args,
  );
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

  const findTab = (selectors: string, labels: string[]): HTMLElement | null => {
    const direct = document.querySelector<HTMLElement>(selectors);
    if (direct) return direct;
    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[role="tab"], a[role="tab"], [role="tab"]',
      ),
    );
    return (
      tabs.find((el) => {
        const t = (el.textContent ?? "").trim().toLowerCase();
        return labels.includes(t);
      }) ?? null
    );
  };

  async function clickTab(
    selectors: string,
    labels: string[],
  ): Promise<boolean> {
    const deadline = Date.now() + 8_000;
    let tab: HTMLElement | null = null;
    while (Date.now() < deadline) {
      tab = findTab(selectors, labels);
      if (tab) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!tab) return false;
    tab.click();
    await new Promise((r) => setTimeout(r, 1_500));
    return true;
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      title?: string;
      author?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
      listKinds?: Array<"liked" | "saved">;
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
      } catch {}

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

  type Kind = "liked" | "saved";
  type Entry = ReturnType<typeof collectFn>[number];

  function withListKind(entries: Entry[], kind: Kind): Entry[] {
    return entries.map((e) => ({
      ...e,
      listKinds: Array.from(new Set([...(e.listKinds ?? []), kind])),
    }));
  }

  function unionList(primary: Entry[], extra: Entry[]): Entry[] {
    const map = new Map<string, Entry>();
    for (const e of [...primary, ...extra]) {
      const prev = map.get(e.sourceId);
      if (!prev) {
        map.set(e.sourceId, e);
        continue;
      }
      map.set(e.sourceId, {
        ...prev,
        listKinds: Array.from(
          new Set([...(prev.listKinds ?? []), ...(e.listKinds ?? [])]),
        ),
      });
    }
    return Array.from(map.values());
  }

  const kinds = args.listKinds ?? ["saved", "liked"];
  let favoriteEntries: Entry[] = [];
  let favoritesEnd = true;
  if (kinds.includes("saved")) {
    await clickTab('[data-e2e="favorites-tab"], [data-e2e="favorite-tab"]', [
      "favorites",
      "favourites",
    ]);
    const favorites = await scroll({
      collectFn,
      knownIds: args.knownIds,
      hydrateSelector: 'a[href*="/video/"]',
    });
    if (!favorites.ok) return favorites;
    favoriteEntries = withListKind(favorites.entries, "saved");
    favoritesEnd = favorites.reachedEnd;
  }
  if (!kinds.includes("liked")) {
    return { ok: true, entries: favoriteEntries, reachedEnd: favoritesEnd };
  }

  const likedClicked = await clickTab(
    '[data-e2e="liked-tab"], [data-e2e="likes-tab"]',
    ["liked"],
  );
  if (!likedClicked) {
    return kinds.includes("saved")
      ? { ok: true, entries: favoriteEntries, reachedEnd: favoritesEnd }
      : { ok: false, reason: "no_match" };
  }

  const liked = await scroll({
    collectFn,
    knownIds: args.knownIds,
    hydrateSelector: 'a[href*="/video/"]',
  });
  if (!liked.ok) {
    return kinds.includes("saved")
      ? { ok: true, entries: favoriteEntries, reachedEnd: favoritesEnd }
      : liked;
  }

  const entries = unionList(
    favoriteEntries,
    withListKind(liked.entries, "liked"),
  );
  return {
    ok: true,
    entries,
    reachedEnd: favoritesEnd && liked.reachedEnd,
    seen: entries.length,
  };
}
