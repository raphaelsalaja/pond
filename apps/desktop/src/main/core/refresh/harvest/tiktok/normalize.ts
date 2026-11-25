/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { BrowserValidators } from "../lib/browser-validation";

declare global {
  var __UNIVERSAL_DATA_FOR_REHYDRATION__: TiktokHydration | undefined;
  var SIGI_STATE: TiktokHydration | undefined;
}

interface TiktokItemStruct {
  id?: string;
  desc?: string;
  description?: string;
  createTime?: number;
  author?: {
    uniqueId?: string;
    nickname?: string;
    avatarThumb?: string;
    verified?: boolean;
  };
  stats?: {
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    playCount?: number;
    collectCount?: number;
  };
  music?: { title?: string };
  video?: {
    downloadAddr?: string;
    playAddr?: string;
    cover?: string;
    originCover?: string;
    duration?: number;
  };
}

interface TiktokItemModule {
  [videoId: string]: TiktokItemStruct;
}

interface TiktokHydration {
  __DEFAULT_SCOPE__?: {
    "webapp.video-detail"?: { itemInfo?: { itemStruct?: TiktokItemStruct } };
  };
  ItemModule?: TiktokItemModule;
}

export interface TiktokMedia {
  url: string;
  type: MediaType;
  poster?: string;
}

export interface TiktokVideoMeta {
  authorUrl?: string;
  authorName?: string;
  authorAvatar?: string;
  verified?: boolean;
  soundName?: string;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    plays?: number;
    bookmarks?: number;
  };
  durationSec?: number;
  publishedAt?: string;
  lang?: string;
}

export interface TiktokVideoPage {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<TiktokMedia>;
  mediaType?: MediaType;
  meta?: TiktokVideoMeta;
}

export function inPageTiktokNormalize(validators: BrowserValidators) {
  function extractVideoId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function extractVideoPageMeta(): TiktokVideoPage | null {
    const out: TiktokVideoPage = {};
    const meta: TiktokVideoMeta = {};

    const hydrationData =
      readHydration(
        "__UNIVERSAL_DATA_FOR_REHYDRATION__",
        globalThis.__UNIVERSAL_DATA_FOR_REHYDRATION__,
      ) ?? readHydration("SIGI_STATE", globalThis.SIGI_STATE);

    if (hydrationData) {
      return extractFromHydration(hydrationData);
    }

    const descEl = document.querySelector<HTMLElement>(
      '[data-e2e="browse-video-desc"], [data-e2e="video-desc"], h1',
    );
    const desc = descEl?.textContent?.trim();
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
      const firstLine = desc.split(/\n+/)[0]?.trim() ?? desc;
      out.title =
        firstLine.length <= 90
          ? firstLine
          : `${firstLine.slice(0, 89).trimEnd()}…`;
    }

    const authorLink = document.querySelector<HTMLAnchorElement>(
      '[data-e2e="browse-username"], [data-e2e="video-author-uniqueid"]',
    );
    const authorHandle = authorLink?.textContent?.trim();
    if (authorHandle) {
      out.author = authorHandle.startsWith("@")
        ? authorHandle
        : `@${authorHandle}`;
      meta.authorUrl = `https://www.tiktok.com/${out.author}`;
    }

    const nameEl = document.querySelector<HTMLElement>(
      '[data-e2e="browse-nickname"], [data-e2e="video-author-nickname"]',
    );
    if (nameEl?.textContent?.trim()) {
      meta.authorName = nameEl.textContent.trim();
    }

    const avatarImg = document.querySelector<HTMLImageElement>(
      '[data-e2e="browse-user-avatar"] img, [data-e2e="video-avatar"] img',
    );
    if (avatarImg?.src) meta.authorAvatar = avatarImg.src;

    const soundLink = document.querySelector<HTMLElement>(
      '[data-e2e="browse-music"], [data-e2e="video-music"]',
    );
    if (soundLink?.textContent?.trim()) {
      meta.soundName = soundLink.textContent.trim();
    }

    const video = document.querySelector<HTMLVideoElement>("video");
    if (video?.src) {
      const poster = video.poster || undefined;
      const clip: TiktokMedia = { url: video.src, type: "video" };
      if (poster) clip.poster = poster;
      out.mediaUrl = poster || video.src;
      out.mediaUrls = [clip];
      out.mediaType = "video";
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        meta.durationSec = Math.round(dur);
      }
    }

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    if (!out.title && !out.description && !out.mediaUrl) return null;
    return out;
  }

  function readHydration(
    varName: string,
    inlined: TiktokHydration | undefined,
  ): TiktokHydration | null {
    try {
      const script = document.querySelector<HTMLScriptElement>(
        `script#${varName}, script[id="${varName}"]`,
      );
      if (script?.textContent) {
        const parsed: unknown = JSON.parse(script.textContent);
        return isHydration(parsed) ? parsed : null;
      }
    } catch {
      /** Unparseable hydration falls back to the copy the page inlined. */
    }
    return inlined || null;
  }

  function isHydration(value: unknown): value is TiktokHydration {
    return validators.object.safeParse(value).success;
  }

  function isItemStruct(
    container: TiktokItemStruct | TiktokItemModule,
  ): container is TiktokItemStruct {
    return Boolean(container.id);
  }

  function extractFromHydration(data: TiktokHydration): TiktokVideoPage | null {
    const container =
      data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct ??
      data.ItemModule;
    if (!container) return null;
    const rawItem = isItemStruct(container)
      ? container
      : Object.values(container)[0];
    if (!rawItem) return null;
    const item = validators.tiktokItem.parse(rawItem);

    const out: TiktokVideoPage = {};
    const meta: TiktokVideoMeta = {};

    const desc = item.desc ?? item.description ?? "";
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
      const firstLine = desc.split(/\n+/)[0]?.trim() ?? desc;
      out.title =
        firstLine.length <= 90
          ? firstLine
          : `${firstLine.slice(0, 89).trimEnd()}…`;
    }

    const author = item.author;
    if (author?.uniqueId) {
      out.author = `@${author.uniqueId}`;
      meta.authorUrl = `https://www.tiktok.com/@${author.uniqueId}`;
      if (author.nickname) meta.authorName = author.nickname;
      if (author.avatarThumb) meta.authorAvatar = author.avatarThumb;
      if (author.verified !== undefined) meta.verified = author.verified;
    }

    const stats = item.stats;
    if (stats) {
      const metrics: NonNullable<TiktokVideoMeta["metrics"]> = {};
      if (stats.diggCount !== undefined) {
        metrics.likes = stats.diggCount;
      }
      if (stats.commentCount !== undefined) {
        metrics.comments = stats.commentCount;
      }
      if (stats.shareCount !== undefined) {
        metrics.shares = stats.shareCount;
      }
      if (stats.playCount !== undefined) {
        metrics.plays = stats.playCount;
      }
      /** collectCount is TikTok's "Favorites" button, the equivalent of bookmarks elsewhere. */
      if (stats.collectCount !== undefined) {
        metrics.bookmarks = stats.collectCount;
      }
      if (Object.keys(metrics).length > 0) {
        meta.metrics = metrics;
      }
    }

    const music = item.music;
    if (music?.title) meta.soundName = music.title;

    const videoData = item.video;
    if (videoData) {
      const videoUrl = videoData.downloadAddr || videoData.playAddr || "";
      const cover = videoData.cover || videoData.originCover || "";
      if (videoUrl || cover) {
        const clip: TiktokMedia = { url: videoUrl || cover, type: "video" };
        if (cover) clip.poster = cover;
        out.mediaUrl = cover || videoUrl;
        out.mediaUrls = [clip];
        out.mediaType = "video";
      }
      if (videoData.duration !== undefined) {
        meta.durationSec = videoData.duration;
      }
    }

    if (item.createTime !== undefined) {
      meta.publishedAt = new Date(item.createTime * 1000).toISOString();
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return { extractVideoId, extractVideoPageMeta };
}
