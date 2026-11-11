/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { BrowserValidators } from "../lib/browser-validation";

interface YoutubeThumbnail {
  url?: string;
  width?: number;
  height?: number;
}

interface YoutubePlayerResponse {
  videoDetails?: {
    videoId?: string;
    shortDescription?: string;
    viewCount?: string;
    lengthSeconds?: string;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      publishDate?: string;
      thumbnail?: {
        isOriginalAspectRatio?: boolean;
        thumbnails?: YoutubeThumbnail[];
      };
    };
  };
}

declare global {
  var ytInitialPlayerResponse: YoutubePlayerResponse | undefined;
}

export interface YoutubeWatchMeta {
  authorUrl?: string;
  authorAvatar?: string;
  views?: number;
  publishedAt?: string;
  likes?: number;
  durationSec?: number;
  lang?: string;
}

export interface YoutubeWatchPage {
  title: string;
  author?: string;
  description?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url: string; type: MediaType }>;
  mediaType?: MediaType;
  meta?: YoutubeWatchMeta;
}

export function inPageYoutubeNormalize(validators: BrowserValidators) {
  function extractVideoId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      if (u.searchParams.has("v")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] ?? null;
      }
    } catch {}
    return null;
  }

  function parseCount(text: string | null | undefined): number | undefined {
    if (!text) return undefined;
    const m = text.replace(/,/g, "").match(/([\d.]+)\s*([KMB]?)/i);
    if (!m?.[1]) return undefined;
    const num = Number.parseFloat(m[1]);
    if (!Number.isFinite(num)) return undefined;
    const suffix = (m[2] ?? "").toUpperCase();
    const mult =
      suffix === "K"
        ? 1_000
        : suffix === "M"
          ? 1_000_000
          : suffix === "B"
            ? 1_000_000_000
            : 1;
    return Math.round(num * mult);
  }

  function extractWatchPageMeta(): YoutubeWatchPage | null {
    const titleEl = document.querySelector<HTMLElement>(
      "#title h1 yt-formatted-string, #title h1",
    );
    const title = titleEl?.textContent?.trim();
    if (!title) return null;

    const out: YoutubeWatchPage = { title };
    const meta: YoutubeWatchMeta = {};

    const channelEl = document.querySelector<HTMLElement>(
      "#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a",
    );
    if (channelEl) {
      out.author = channelEl.textContent?.trim();
      const href = channelEl.getAttribute("href");
      if (href) {
        meta.authorUrl = href.startsWith("http")
          ? href
          : `https://www.youtube.com${href}`;
      }
    }

    const avatarImg = document.querySelector<HTMLImageElement>(
      "#owner img, ytd-video-owner-renderer img",
    );
    if (avatarImg?.src) meta.authorAvatar = avatarImg.src;

    const description = readDescription();
    if (description) out.description = description;

    const infoStrings = document.querySelectorAll<HTMLElement>(
      "#info-strings yt-formatted-string, ytd-video-primary-info-renderer #info yt-formatted-string",
    );
    for (const el of Array.from(infoStrings)) {
      const t = el.textContent?.trim() ?? "";
      if (/views/i.test(t)) {
        const v = parseCount(t);
        if (v !== undefined) meta.views = v;
      }
      if (
        /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)
      ) {
        meta.publishedAt = t;
      }
    }

    const likeBtn = document.querySelector<HTMLElement>(
      'button[aria-label*="like" i], ytd-toggle-button-renderer:first-child yt-formatted-string',
    );
    const likeLabel =
      likeBtn?.getAttribute("aria-label") ?? likeBtn?.textContent ?? "";
    const likes = parseCount(likeLabel);
    if (likes !== undefined) meta.likes = likes;

    const video = document.querySelector<HTMLVideoElement>("video");
    if (video) {
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        meta.durationSec = Math.round(dur);
      }
    }

    const ogImage = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    const portrait = readPortraitThumbnail();
    const landscape =
      (video?.poster && video.poster.length > 0 ? video.poster : undefined) ||
      ogImage?.content;
    if (video || portrait || landscape) out.mediaType = "video";
    if (portrait) out.mediaUrl = portrait;
    else if (landscape) out.mediaUrl = landscape;

    if (out.mediaUrl) {
      out.mediaUrls = [{ url: out.mediaUrl, type: "video" }];
    }

    Object.assign(meta, readPlayerMeta());

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  /** Player caption. The description box also contains views, the date, and a hidden digit probe. */
  function readDescription(): string | undefined {
    const fromPlayer = readPlayerDescription();
    if (fromPlayer !== null) return fromPlayer;
    return readDomDescription();
  }

  /** `ytInitialPlayerResponse` keeps the first video's data after in-app navigation. */
  function currentPlayerResponse(): YoutubePlayerResponse | undefined {
    const player = globalThis.ytInitialPlayerResponse;
    const id = player?.videoDetails?.videoId;
    if (id && id !== extractVideoId(location.href)) return undefined;
    return player;
  }

  /** Shorts publish an upright original-aspect image beside the blurred 16:9 poster. */
  function readPortraitThumbnail(): string | undefined {
    const thumbnail =
      currentPlayerResponse()?.microformat?.playerMicroformatRenderer
        ?.thumbnail;
    if (thumbnail?.isOriginalAspectRatio !== true) return undefined;
    const thumbs = thumbnail.thumbnails;
    if (!Array.isArray(thumbs)) return undefined;
    let best: { url: string; height: number } | undefined;
    for (const item of thumbs) {
      const url = validators.text.safeParse(item?.url);
      const width = validators.number.safeParse(item?.width);
      const height = validators.number.safeParse(item?.height);
      if (!url.success || !width.success || !height.success) continue;
      if (
        !url.data.startsWith("https://") ||
        !(height.data > width.data && width.data > 0)
      ) {
        continue;
      }
      if (!best || height.data > best.height) {
        best = { url: url.data, height: height.data };
      }
    }
    return best?.url;
  }

  /** The `<video>` element reports the pre-roll ad's length while one plays, and the info line moves between layouts. */
  function readPlayerMeta(): Pick<
    YoutubeWatchMeta,
    "views" | "publishedAt" | "durationSec"
  > {
    const player = currentPlayerResponse();
    const out: Pick<YoutubeWatchMeta, "views" | "publishedAt" | "durationSec"> =
      {};
    const views = validators.text.safeParse(player?.videoDetails?.viewCount);
    if (views.success && /^\d+$/.test(views.data))
      out.views = Number(views.data);
    const length = validators.text.safeParse(
      player?.videoDetails?.lengthSeconds,
    );
    if (length.success && /^[1-9]\d*$/.test(length.data))
      out.durationSec = Number(length.data);
    const published = validators.text.safeParse(
      player?.microformat?.playerMicroformatRenderer?.publishDate,
    );
    if (published.success && published.data) out.publishedAt = published.data;
    return out;
  }

  function readPlayerDescription(): string | undefined | null {
    const parsed = validators.text.safeParse(
      currentPlayerResponse()?.videoDetails?.shortDescription,
    );
    if (!parsed.success) return null;
    return clipText(parsed.data);
  }

  function readDomDescription(): string | undefined {
    const selectors = [
      "ytd-expandable-video-description-body-renderer #attributed-snippet-text",
      "#description-inline-expander #expanded yt-attributed-string",
      "#description-inline-expander #attributed-snippet-text",
      "ytd-text-inline-expander #snippet-text",
    ];
    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      const text = el ? elementText(el) : "";
      if (!text) continue;
      return clipText(stripDescriptionChrome(text));
    }
    return undefined;
  }

  function isElement(node: Node): node is HTMLElement {
    return node.nodeType === 1;
  }

  function elementText(el: HTMLElement): string {
    const parts: string[] = [];
    function walk(node: Node) {
      if (node.nodeType === 3) {
        parts.push(node.textContent ?? "");
        return;
      }
      if (!isElement(node) || isHidden(node)) return;
      if (node.tagName === "BR") {
        parts.push("\n");
        return;
      }
      for (const next of Array.from(node.childNodes)) walk(next);
    }
    for (const child of Array.from(el.childNodes)) walk(child);
    return parts
      .join("")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function isHidden(el: HTMLElement): boolean {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    const style = el.getAttribute("style") ?? "";
    return /visibility\s*:\s*hidden|display\s*:\s*none/i.test(style);
  }

  function clipText(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
  }

  function stripDescriptionChrome(raw: string): string {
    const kept: string[] = [];
    for (const line of raw.split(/\n/)) {
      const trimmed = line.trim();
      if (isDescriptionChrome(trimmed)) continue;
      kept.push(trimmed);
    }
    while (kept[0] === "") kept.shift();
    while (kept[kept.length - 1] === "") kept.pop();
    return kept
      .join("\n")
      .replace(/[ \t]*(?:\.{3}|…)\s*more\s*$/i, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isDescriptionChrome(line: string): boolean {
    if (!line) return false;
    if (isDigitProbe(line)) return true;
    if (/^(?:views|[KMB])$/i.test(line)) return true;
    if (/^(?:\d+\s*)?(?:[smhdwy]|mo|yr)\s+ago$/i.test(line)) return true;
    if (/^\d[\d,.]*\s*(?:[KMB]\s+)?views\b.*•/i.test(line)) return true;
    if (/^(?:\.{3}|…)\s*more$/i.test(line)) return true;
    if (/^show less$/i.test(line)) return true;
    return false;
  }

  function isDigitProbe(line: string): boolean {
    if (!/^[\d\s]+(?:[KMB])?$/i.test(line)) return false;
    return line.replace(/\D/g, "").length >= 10;
  }

  return { extractVideoId, parseCount, extractWatchPageMeta };
}
