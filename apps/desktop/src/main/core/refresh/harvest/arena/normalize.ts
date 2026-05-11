/// <reference lib="dom" />

/**
 * Shared Are.na extraction helpers. Serializable via `.toString()`.
 */
export function inPageArenaNormalize() {
  function extractBlockId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/block\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function extractBlockPageMeta(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    const titleEl = document.querySelector<HTMLElement>(
      "[class*='BlockTitle'], [class*='block__title'], h1, h2",
    );
    const title = titleEl?.textContent?.trim();
    if (title) out.title = title;

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
    if (sourceLink?.href) meta.sourceUrl = sourceLink.href;

    const channelLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        "[class*='BlockConnections'] a, [class*='connected'] a",
      ),
    );
    const channels = channelLinks
      .map((a) => a.textContent?.trim())
      .filter(Boolean);
    if (channels.length > 0) meta.connectedChannels = channels;

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
      out.mediaUrls = [
        {
          url: video.src,
          type: "video",
          ...(poster ? { poster } : {}),
        },
      ];
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

    if (Object.keys(meta).length > 0) out.meta = meta;
    if (!out.title && !out.description && !out.mediaUrl) return null;
    return out;
  }

  return { extractBlockId, extractBlockPageMeta };
}
