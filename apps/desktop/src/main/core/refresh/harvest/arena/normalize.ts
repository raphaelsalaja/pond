/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";

interface ArenaBlockPageMedia {
  url: string;
  type: MediaType;
  poster?: string;
}

interface ArenaBlockPageMeta {
  authorUrl?: string;
  sourceUrl?: string;
  connectedChannels?: Array<string>;
  lang?: string;
}

export interface ArenaBlockPage {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<ArenaBlockPageMedia>;
  mediaType?: MediaType;
  meta?: ArenaBlockPageMeta;
}

export function inPageArenaNormalize() {
  function extractBlockId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/block\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function extractBlockPageMeta(): ArenaBlockPage | null {
    const out: ArenaBlockPage = {};
    const meta: ArenaBlockPageMeta = {};

    const titleEl = document.querySelector<HTMLElement>(
      "[class*='BlockTitle'], [class*='block__title'], h1, h2",
    );
    const title = titleEl?.textContent?.trim();
    if (title) {
      out.title = title;
    }

    const descEl = document.querySelector<HTMLElement>(
      "[class*='BlockDescription'], [class*='block__description'], [class*='description']",
    );
    const desc = descEl?.textContent?.trim();
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    }

    const userLink = document.querySelector<HTMLAnchorElement>(
      "[class*='BlockUser'] a, [class*='block__user'] a, [class*='author'] a",
    );
    if (userLink?.textContent?.trim()) {
      out.author = userLink.textContent.trim();
      const href = userLink.getAttribute("href");
      if (href) {
        meta.authorUrl = href.startsWith("http")
          ? href
          : `https://www.are.na${href}`;
      }
    }

    const sourceLink = document.querySelector<HTMLAnchorElement>(
      "[class*='BlockSource'] a, a[class*='source']",
    );
    if (sourceLink?.href) {
      meta.sourceUrl = sourceLink.href;
    }

    const channelLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        "[class*='BlockConnections'] a, [class*='connected'] a",
      ),
    );
    const channels: Array<string> = [];
    for (const a of channelLinks) {
      const text = a.textContent?.trim();
      if (text) {
        channels.push(text);
      }
    }
    if (channels.length > 0) {
      meta.connectedChannels = channels;
    }

    const mainImg = document.querySelector<HTMLImageElement>(
      "[class*='BlockImage'] img, [class*='block__image'] img, main img",
    );
    const imgSrc = mainImg?.src ?? mainImg?.currentSrc;
    if (imgSrc && !imgSrc.startsWith("data:")) {
      out.mediaUrl = imgSrc;
      out.mediaUrls = [{ url: imgSrc, type: "image" }];
      out.mediaType = "image";
    }

    const video = document.querySelector<HTMLVideoElement>("video");
    if (video?.src) {
      const poster = video.poster || imgSrc || undefined;
      out.mediaUrl = poster || video.src;
      const entry: ArenaBlockPageMedia = { url: video.src, type: "video" };
      if (poster) {
        entry.poster = poster;
      }
      out.mediaUrls = [entry];
      out.mediaType = "video";
    }

    const textBlock = document.querySelector<HTMLElement>(
      "[class*='BlockText'], [class*='block__text']",
    );
    if (textBlock?.textContent?.trim() && !out.description) {
      const t = textBlock.textContent.trim();
      out.description = t.length > 4000 ? `${t.slice(0, 4000)}…` : t;
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

  return { extractBlockId, extractBlockPageMeta };
}
