/// <reference lib="dom" />

export function inPagePinterestNormalize() {
  function extractPinId(href: string): string | null {
    try {
      const u = new URL(href, location.origin);
      return u.pathname.match(/\/pin\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function extractPinPageMeta(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    const getMeta = (selectors: readonly string[]): string | undefined => {
      for (const sel of selectors) {
        const el = document.querySelector<HTMLMetaElement>(sel);
        const value = el?.content?.trim();
        if (value) return value;
      }
      return undefined;
    };

    const upgradeImage = (src: string): string =>
      src.replace(/\/\d+x(?:\d+)?\//, "/originals/");

    const titleEl = document.querySelector<HTMLElement>(
      '[data-test-id="pin-title"], [data-test-id="pinTitle"], h1',
    );
    const title =
      titleEl?.textContent?.trim() ||
      getMeta([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
      ]);
    if (title) {
      const cleaned = title.replace(/\s+\|\s+Pinterest\s*$/i, "").trim();
      if (cleaned) out.title = cleaned;
    }

    const descEl = document.querySelector<HTMLElement>(
      '[data-test-id="truncated-description"], [data-test-id="pin-description"], [data-test-id="richPinInformation"]',
    );
    const desc =
      descEl?.textContent?.trim() ||
      getMeta([
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]',
      ]);
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    }

    const pinnerLink = document.querySelector<HTMLAnchorElement>(
      '[data-test-id="pin-creator-profile"] a, [data-test-id="pinner-name"] a',
    );
    if (pinnerLink) {
      const name = pinnerLink.textContent?.trim();
      if (name) {
        out.author = name;
        meta.authorName = name;
      }
      const href = pinnerLink.getAttribute("href");
      if (href) {
        meta.authorUrl = href.startsWith("http")
          ? href
          : `https://www.pinterest.com${href}`;
      }
    } else {
      const ogAuthor = getMeta([
        'meta[name="pinterestapp:pinner"]',
        'meta[property="article:author"]',
      ]);
      if (ogAuthor) {
        out.author = ogAuthor;
        meta.authorName = ogAuthor;
      }
    }

    const avatarImg = document.querySelector<HTMLImageElement>(
      '[data-test-id="pin-creator-profile"] img, [data-test-id="pinner-avatar"] img',
    );
    if (avatarImg?.src) meta.authorAvatar = avatarImg.src;

    const boardLink = document.querySelector<HTMLAnchorElement>(
      '[data-test-id="board-name"] a, [data-test-id="board-link"]',
    );
    if (boardLink?.textContent?.trim()) {
      meta.boardName = boardLink.textContent.trim();
    } else {
      const ogBoard = getMeta(['meta[name="pinterestapp:pinboard"]']);
      if (ogBoard) meta.boardName = ogBoard;
    }

    const mainImg = document.querySelector<HTMLImageElement>(
      '[data-test-id="pin-closeup-image"] img, [data-test-id="pinImg"]',
    );
    const domImgSrc = mainImg?.src ?? mainImg?.currentSrc;
    const ogImage = getMeta([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]);
    const imgSrc = domImgSrc || ogImage;
    if (imgSrc) {
      const upgraded = upgradeImage(imgSrc);
      out.mediaUrl = upgraded;
      out.mediaUrls = [{ url: upgraded, type: "image" }];
      out.mediaType = "image";
    }

    const video = document.querySelector<HTMLVideoElement>("video");
    const ogVideo = getMeta([
      'meta[property="og:video"]',
      'meta[property="og:video:url"]',
      'meta[property="og:video:secure_url"]',
    ]);
    const videoSrc =
      video?.src || video?.querySelector("source")?.src || ogVideo || "";
    if (videoSrc) {
      const poster = video?.poster || imgSrc || undefined;
      out.mediaUrl = poster || videoSrc;
      out.mediaUrls = [
        { url: videoSrc, type: "video", ...(poster ? { poster } : {}) },
      ];
      out.mediaType = "video";
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

  return { extractPinId, extractPinPageMeta };
}
