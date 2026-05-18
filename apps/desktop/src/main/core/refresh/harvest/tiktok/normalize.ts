/// <reference lib="dom" />

export function inPageTiktokNormalize() {
  function extractVideoId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function extractVideoPageMeta(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    const hydrationData =
      tryParseHydration("__UNIVERSAL_DATA_FOR_REHYDRATION__") ??
      tryParseHydration("SIGI_STATE");

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
      out.mediaUrl = poster || video.src;
      out.mediaUrls = [
        {
          url: video.src,
          type: "video",
          ...(poster ? { poster } : {}),
        },
      ];
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

  function tryParseHydration(varName: string): any {
    try {
      const script = document.querySelector<HTMLScriptElement>(
        `script#${varName}, script[id="${varName}"]`,
      );
      if (script?.textContent) {
        return JSON.parse(script.textContent);
      }
      const win = window as any;
      if (win[varName]) return win[varName];
    } catch {
      /* not available */
    }
    return null;
  }

  function extractFromHydration(data: any): Record<string, unknown> | null {
    const itemModule =
      data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct ??
      data?.ItemModule ??
      null;

    let item: any = null;
    if (itemModule && typeof itemModule === "object") {
      if (itemModule.id) {
        item = itemModule;
      } else {
        const keys = Object.keys(itemModule);
        const firstKey = keys[0];
        if (firstKey) item = itemModule[firstKey];
      }
    }

    if (!item) return null;

    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

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
      if (typeof author.verified === "boolean") meta.verified = author.verified;
    }

    const stats = item.stats;
    if (stats) {
      const metrics: Record<string, number> = {};
      if (typeof stats.diggCount === "number") metrics.likes = stats.diggCount;
      if (typeof stats.commentCount === "number")
        metrics.comments = stats.commentCount;
      if (typeof stats.shareCount === "number")
        metrics.shares = stats.shareCount;
      if (typeof stats.playCount === "number") metrics.plays = stats.playCount;
      // TikTok's "Favorites" button — equivalent to bookmarks elsewhere.
      if (typeof stats.collectCount === "number")
        metrics.bookmarks = stats.collectCount;
      if (Object.keys(metrics).length > 0) meta.metrics = metrics;
    }

    const music = item.music;
    if (music?.title) meta.soundName = music.title;

    const videoData = item.video;
    if (videoData) {
      const videoUrl = videoData.downloadAddr || videoData.playAddr || "";
      const cover = videoData.cover || videoData.originCover || "";
      if (videoUrl || cover) {
        out.mediaUrl = cover || videoUrl;
        out.mediaUrls = [
          {
            url: videoUrl || cover,
            type: "video",
            ...(cover ? { poster: cover } : {}),
          },
        ];
        out.mediaType = "video";
      }
      if (typeof videoData.duration === "number") {
        meta.durationSec = videoData.duration;
      }
    }

    if (typeof item.createTime === "number") {
      meta.publishedAt = new Date(item.createTime * 1000).toISOString();
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return { extractVideoId, extractVideoPageMeta };
}
