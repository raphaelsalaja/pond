/// <reference lib="dom" />

/**
 * Are.na single-block collector. Scrapes the `/block/<id>` page for
 * rich metadata: full content, connected channels, source attribution.
 */

import type { ScrapedHarvest } from "../types";
import { inPageArenaNormalize } from "./normalize";

export function buildExpression(blockId: string): string {
  const normSrc = `(${inPageArenaNormalize.toString()})()`;
  const fnSrc = `(${inPageArenaHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const blockId = ${JSON.stringify(blockId)};
    try { return await ${fnSrc}(blockId, norm); } catch (e) { return null; }
  })()`;
}

async function inPageArenaHarvest(
  _blockId: string,
  norm: ReturnType<typeof inPageArenaNormalize>,
): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        "[class*='BlockImage'], [class*='BlockText'], main img, main video",
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractBlockPageMeta();
}

export function adapt(raw: unknown): ScrapedHarvest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.title && !o.description && !o.mediaUrl) return null;
  const metaObj =
    o.meta && typeof o.meta === "object"
      ? (o.meta as Record<string, unknown>)
      : undefined;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    author: typeof o.author === "string" ? o.author : undefined,
    lang:
      typeof metaObj?.lang === "string" ? (metaObj.lang as string) : undefined,
    mediaUrl: typeof o.mediaUrl === "string" ? o.mediaUrl : undefined,
    mediaUrls: Array.isArray(o.mediaUrls)
      ? (o.mediaUrls as ScrapedHarvest["mediaUrls"])
      : undefined,
    mediaType:
      typeof o.mediaType === "string"
        ? (o.mediaType as ScrapedHarvest["mediaType"])
        : undefined,
    meta: metaObj,
  };
}

export function sourceIdFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    return u.pathname.match(/\/block\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
