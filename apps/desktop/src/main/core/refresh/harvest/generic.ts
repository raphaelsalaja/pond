/// <reference lib="dom" />
import type { ScrapedHarvest } from "./types";

/**
 * In-page harvester that just reads `<meta property="og:*">` and the
 * document title. Useful for sources where:
 *   1. We *do* have a dedicated source classification (e.g. Pinterest,
 *      Cosmos, Are.na) but no purpose-built harvester yet, AND
 *   2. The page needs JS to populate its OG tags (which the server-side
 *      `og.ts` reader can't see).
 *
 * Falls back to `extension/popup`-style behaviour: just give us
 * whatever rich-link metadata the page wants to advertise.
 */
export function buildExpression(): string {
  function inPage(): unknown {
    function metaContent(...keys: string[]): string | undefined {
      for (const k of keys) {
        const sel = `meta[property="${k}"], meta[name="${k}"], meta[itemprop="${k}"]`;
        const el = document.querySelector(sel) as HTMLMetaElement | null;
        const v = el?.content?.trim();
        if (v) return v;
      }
      return undefined;
    }

    const title = metaContent("og:title", "twitter:title") ?? document.title;
    const description = metaContent(
      "og:description",
      "twitter:description",
      "description",
    );
    const author = metaContent("og:author", "article:author", "author");
    const image = metaContent(
      "og:image:secure_url",
      "og:image",
      "twitter:image",
    );
    const video = metaContent(
      "og:video:secure_url",
      "og:video",
      "twitter:player:stream",
    );

    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};
    if (title) out.title = title.replace(/\s+/g, " ").trim().slice(0, 500);
    if (description) out.description = description;
    if (author) out.author = author;
    const cover = video ?? image;
    if (cover) {
      out.mediaUrl = cover;
      out.mediaUrls = [{ url: cover, type: video ? "video" : "image" }];
      out.mediaType = video ? "video" : "image";
    } else {
      out.mediaType = "link";
    }
    // Page-wide hints worth keeping for the renderer / search index.
    // None of these are universal enough yet to deserve a top-level
    // column; bundle them under `meta` so they ride into `raw.<source>`
    // via the existing merge.
    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }
    const siteName = metaContent("og:site_name", "application-name");
    if (siteName) meta.siteName = siteName.trim();
    const publishedAt = metaContent(
      "article:published_time",
      "og:article:published_time",
      "datePublished",
    );
    if (publishedAt) meta.publishedAt = publishedAt;
    const canonicalEl = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const canonical = canonicalEl?.href?.trim();
    if (canonical) meta.canonical = canonical;
    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  const fnSrc = inPage.toString();
  return `(async () => {
    const fn = ${fnSrc};
    // Wait for og:image to materialise — many SPAs inject it after first paint.
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (document.querySelector('meta[property="og:image"], meta[property="og:title"]')) break;
      await new Promise(r => setTimeout(r, 200));
    }
    try { return fn(); } catch (e) { return null; }
  })()`;
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
    lang: typeof o.lang === "string" ? (o.lang as string) : undefined,
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

/**
 * Fall back to the URL itself for `sourceId` when the host has no
 * structured permalink. Yields something stable per page so re-runs
 * still merge into the same row.
 */
export function sourceIdFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.host}${u.pathname}${u.search}`.slice(0, 256);
  } catch {
    return rawUrl.slice(0, 256);
  }
}
