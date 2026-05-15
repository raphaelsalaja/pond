/// <reference lib="dom" />

import type { ScrapedHarvest } from "../types";
import { inPageTiktokNormalize } from "./normalize";

export function buildExpression(videoId: string): string {
  const normSrc = `(${inPageTiktokNormalize.toString()})()`;
  const fnSrc = `(${inPageTiktokHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const videoId = ${JSON.stringify(videoId)};
    try { return await ${fnSrc}(videoId, norm); } catch (e) { return null; }
  })()`;
}

async function inPageTiktokHarvest(
  _videoId: string,
  norm: ReturnType<typeof inPageTiktokNormalize>,
): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector("video") ||
      document.querySelector('[data-e2e="browse-video-desc"]')
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractVideoPageMeta();
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
    return u.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
