/// <reference lib="dom" />

import { buildScrollListExpression } from "../lib/expression";
import type { inPageScrollCollect } from "../lib/scroll";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { inPagePinterestNormalize } from "./normalize";

export function pinterestProfileUrl(_handle: string): string {
  return "https://www.pinterest.com/me/pins/";
}

export function buildPinterestListExpression(args: ListHarvestArgs): string {
  return buildScrollListExpression(
    inPagePinterestNormalize,
    inPagePinterestList,
    args,
  );
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
        /** An unparseable href is skipped like any other non-pin link. */
      }
      if (!id || seen.has(id)) {
        continue;
      }
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
