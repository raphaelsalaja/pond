/// <reference lib="dom" />

/**
 * Pinterest single-pin collector. Scrapes the `/pin/<id>/` page for
 * rich metadata: full description, pinner info, board name, full-res image.
 */

import type { ScrapedHarvest } from "../types";
import { inPagePinterestNormalize } from "./normalize";

export function buildExpression(pinId: string): string {
  const normSrc = `(${inPagePinterestNormalize.toString()})()`;
  const fnSrc = `(${inPagePinterestHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const pinId = ${JSON.stringify(pinId)};
    try { return await ${fnSrc}(pinId, norm); } catch (e) { return null; }
  })()`;
}

async function inPagePinterestHarvest(
  _pinId: string,
  norm: ReturnType<typeof inPagePinterestNormalize>,
): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        '[data-test-id="pin-closeup-image"], [data-test-id="pinImg"], img[src*="pinimg.com"]',
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractPinPageMeta();
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
    return u.pathname.match(/\/pin\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
