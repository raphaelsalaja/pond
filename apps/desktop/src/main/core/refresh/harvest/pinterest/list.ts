/// <reference lib="dom" />

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

  // The Pinterest grid only exposes a tiny thumbnail and (often empty) alt
  // text per card. We emit bare stub entries so every pin goes through the
  // per-pin harvester in `inPagePinterestHarvest`, which can read the real
  // title/description/author/board and full-resolution image.
  function collectFn() {
    const out: Array<{ sourceId: string; url: string }> = [];
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
      out.push({
        sourceId: id,
        url: `https://www.pinterest.com/pin/${id}/`,
      });
    }
    return out;
  }

  return scroll({
    collectFn,
    knownIds: args.knownIds,
    hydrateSelector: 'a[href*="/pin/"]',
  });
}
