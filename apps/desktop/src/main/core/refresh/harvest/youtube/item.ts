/// <reference lib="dom" />

/**
 * YouTube single-video collector. Scrapes the `/watch?v=` page for
 * rich metadata that the generic OG-tag harvester misses: channel
 * info, view/like counts, description, duration, avatar.
 */

import type { ScrapedHarvest } from "../types";
import { inPageYoutubeNormalize } from "./normalize";

export function buildExpression(videoId: string): string {
  const normSrc = `(${inPageYoutubeNormalize.toString()})()`;
  const fnSrc = `(${inPageYoutubeHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const videoId = ${JSON.stringify(videoId)};
    try { return await ${fnSrc}(videoId, norm); } catch (e) { return null; }
  })()`;
}

async function inPageYoutubeHarvest(
  _videoId: string,
  norm: ReturnType<typeof inPageYoutubeNormalize>,
): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (document.querySelector("#title h1, ytd-video-primary-info-renderer"))
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractWatchPageMeta();
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
    const v = u.searchParams.get("v");
    if (v) return v;
    if (u.pathname.startsWith("/shorts/")) {
      return u.pathname.split("/")[2] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
