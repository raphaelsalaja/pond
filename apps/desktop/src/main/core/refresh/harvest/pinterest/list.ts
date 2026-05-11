/// <reference lib="dom" />

/**
 * Pinterest list collector. Scrolls the user's saved pins view and
 * collects pin IDs using the shared scroll scaffold.
 */

import type { MediaType } from "@pond/schema/db";
import { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPagePinterestNormalize } from "./normalize";

export function pinterestProfileUrl(_handle: string): string {
  return "https://www.pinterest.com/me/pins/";
}

export function buildPinterestListExpression(args: ListHarvestArgs): string {
  const scrollSrc = `(${inPageScrollCollect.toString()})()`;
  const normSrc = `(${inPagePinterestNormalize.toString()})()`;
  const fnSrc = `(${inPagePinterestList.toString()})`;
  return `(async () => {
    const scroll = ${scrollSrc};
    const norm = ${normSrc};
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args, scroll, norm); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPagePinterestList(
  args: ListHarvestArgs,
  scroll: ReturnType<typeof inPageScrollCollect>,
  _norm: ReturnType<typeof inPagePinterestNormalize>,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/business")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  function collectFn() {
    const out: Array<{
      sourceId: string;
      url: string;
      title?: string;
      mediaUrl?: string;
      mediaType?: MediaType;
    }> = [];
    const seen = new Set<string>();
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/pin/"]'),
    );
    for (const a of links) {
      let id: string | null = null;
      try {
        const u = new URL(a.href, location.origin);
        id = u.pathname.match(/\/pin\/(\d+)/)?.[1] ?? null;
      } catch {
        /* unparseable */
      }
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const img = a.querySelector<HTMLImageElement>("img");
      const src = img?.src ?? img?.currentSrc ?? undefined;
      const mediaUrl = src && !src.startsWith("data:") ? src : undefined;
      const title = img?.alt?.trim() || undefined;
      const hasVideo = !!a.querySelector("video, [data-test-id*='video']");

      out.push({
        sourceId: id,
        url: `https://www.pinterest.com/pin/${id}/`,
        title,
        mediaUrl,
        mediaType: hasVideo ? "video" : mediaUrl ? "image" : undefined,
      });
    }
    return out;
  }

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    maxItems: args.maxItems,
    hydrateSelector: 'a[href*="/pin/"]',
  });
}
