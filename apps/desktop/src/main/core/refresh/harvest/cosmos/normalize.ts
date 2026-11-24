/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";

interface CosmosElementPageMedia {
  url: string;
  type: MediaType;
  poster?: string;
}

interface CosmosElementPageMeta {
  authorUrl?: string;
  authorAvatar?: string;
  lang?: string;
}

export interface CosmosElementPage {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<CosmosElementPageMedia>;
  mediaType?: MediaType;
  meta?: CosmosElementPageMeta;
}

export function inPageCosmosNormalize() {
  function extractElementId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/e\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /** cdn.cosmos.so sits behind Cloudflare image resizing; strip `w`/`h`/`q`/`dpr` params to fetch the full-resolution source while keeping `format`. */
  function upgradeCosmosImage(src: string): string {
    try {
      const u = new URL(src, location.origin);
      if (!/(^|\.)cosmos\.so$/i.test(u.hostname)) {
        return src;
      }
      if (!u.hostname.startsWith("cdn.")) {
        return src;
      }
      for (const key of [
        "w",
        "h",
        "width",
        "height",
        "q",
        "quality",
        "dpr",
        "fit",
        "blur",
      ]) {
        u.searchParams.delete(key);
      }
      return u.toString();
    } catch {
      return src;
    }
  }

  function extractElementPageMeta(): CosmosElementPage | null {
    const out: CosmosElementPage = {};
    const meta: CosmosElementPageMeta = {};

    const titleEl = document.querySelector<HTMLElement>(
      "[class*='title' i], [class*='Title'], h1, h2",
    );
    const title = titleEl?.textContent?.trim();
    if (title) {
      out.title = title;
    }

    const descEl = document.querySelector<HTMLElement>(
      "[class*='description' i], [class*='Description'], [class*='caption' i]",
    );
    const desc = descEl?.textContent?.trim();
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    }

    const authorEl = document.querySelector<HTMLElement>(
      "[class*='author' i], [class*='Author'], [class*='user' i] a",
    );
    if (authorEl?.textContent?.trim()) {
      out.author = authorEl.textContent.trim();
      const link = authorEl.closest("a") ?? authorEl.querySelector("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href) {
          meta.authorUrl = href.startsWith("http")
            ? href
            : `https://www.cosmos.so${href}`;
        }
      }
    }

    const avatarImg = document.querySelector<HTMLImageElement>(
      "[class*='avatar' i] img, [class*='Avatar'] img",
    );
    if (avatarImg?.src) {
      meta.authorAvatar = avatarImg.src;
    }

    const ogImage = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    const ogImageRaw = ogImage?.content?.trim();
    const ogImageUrl =
      ogImageRaw && !ogImageRaw.startsWith("data:")
        ? upgradeCosmosImage(ogImageRaw)
        : undefined;
    if (ogImageUrl) {
      out.mediaUrl = ogImageUrl;
      out.mediaUrls = [{ url: ogImageUrl, type: "image" }];
      out.mediaType = "image";
    }

    const video = document.querySelector<HTMLVideoElement>("video");
    if (video?.src) {
      const poster = video.poster || ogImageUrl || out.mediaUrl;
      out.mediaUrl = poster || video.src;
      const entry: CosmosElementPageMedia = { url: video.src, type: "video" };
      if (poster) {
        entry.poster = poster;
      }
      out.mediaUrls = [entry];
      out.mediaType = "video";
    }

    const ogTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    if (!out.title && ogTitle?.content) {
      out.title = ogTitle.content.trim();
    }

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) {
      out.meta = meta;
    }
    if (!out.title && !out.description && !out.mediaUrl) {
      return null;
    }
    return out;
  }

  return { extractElementId, extractElementPageMeta };
}
