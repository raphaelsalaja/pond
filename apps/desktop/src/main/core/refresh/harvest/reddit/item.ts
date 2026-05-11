/// <reference lib="dom" />

/**
 * Reddit single-post collector. Scrapes old.reddit post pages for
 * rich metadata: full selftext, gallery images, flair, comment count.
 */

import type { ScrapedHarvest } from "../types";
import { inPageRedditNormalize } from "./normalize";

export function buildExpression(fullname: string): string {
  const normSrc = `(${inPageRedditNormalize.toString()})()`;
  const fnSrc = `(${inPageRedditHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const fullname = ${JSON.stringify(fullname)};
    try { return await ${fnSrc}(fullname, norm); } catch (e) { return null; }
  })()`;
}

async function inPageRedditHarvest(
  _fullname: string,
  norm: ReturnType<typeof inPageRedditNormalize>,
): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        ".thing[data-fullname], a.title, [data-click-id='body']",
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractPostPageMeta();
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
    const m = u.pathname.match(/\/comments\/([A-Za-z0-9]+)/);
    if (m?.[1]) return `t3_${m[1]}`;
    return null;
  } catch {
    return null;
  }
}
