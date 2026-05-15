/// <reference lib="dom" />

export function inPageYoutubeNormalize() {
  function extractVideoId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      if (u.searchParams.has("v")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] ?? null;
      }
    } catch {
      /* unparseable */
    }
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

  function extractWatchPageMeta(): Record<string, unknown> | null {
    const titleEl = document.querySelector<HTMLElement>(
      "#title h1 yt-formatted-string, #title h1",
    );
    const title = titleEl?.textContent?.trim();
    if (!title) return null;

    const out: Record<string, unknown> = { title };
    const meta: Record<string, unknown> = {};

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

    const descEl = document.querySelector<HTMLElement>(
      "#description-inner, ytd-text-inline-expander #snippet-text, #description yt-formatted-string",
    );
    const desc = descEl?.textContent?.trim();
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    }

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
      out.mediaUrl = video.poster || undefined;
      out.mediaType = "video";
    }

    const ogImage = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    if (!out.mediaUrl && ogImage?.content) {
      out.mediaUrl = ogImage.content;
      out.mediaType = "video";
    }

    if (out.mediaUrl) {
      out.mediaUrls = [{ url: out.mediaUrl, type: "video" }];
    }

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return { extractVideoId, parseCount, extractWatchPageMeta };
}
