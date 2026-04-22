import type { Source } from "@pond/schema/db";

export interface ScrapedSave {
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "link";
  videoUrl?: string;
}

/**
 * Returns a self-contained function suitable for chrome.scripting.executeScript
 * that scrapes post metadata out of the live page DOM. Executed in the page's
 * isolated world: NO imports, NO outer-scope captures.
 */
export function scrapeFnFor(source: Source): (() => ScrapedSave) | null {
  switch (source) {
    case "instagram":
      return scrapeInstagram;
    case "pinterest":
      return scrapePinterest;
    default:
      return null;
  }
}

function scrapeInstagram(): ScrapedSave {
  function meta(name: string): string | undefined {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="${name}"], meta[name="${name}"]`,
    );
    return el?.content?.trim() || undefined;
  }
  function pickLargestSrcset(srcset: string): string | undefined {
    const parts = srcset
      .split(",")
      .map((p) => p.trim())
      .map((p) => {
        const [u, sz] = p.split(/\s+/);
        return { u, w: sz ? parseInt(sz, 10) : 0 };
      })
      .filter((p) => p.u);
    if (!parts.length) return undefined;
    parts.sort((a, b) => b.w - a.w);
    return parts[0]?.u;
  }

  const out: ScrapedSave = {};
  const article = document.querySelector("article") ?? document.body;

  // Caption / description.
  const caption =
    meta("og:description") ??
    article.querySelector('h1')?.textContent?.trim() ??
    article.querySelector("[data-testid='post-caption']")?.textContent?.trim();
  if (caption) {
    out.description = caption;
    out.title = caption.replace(/\s+/g, " ").slice(0, 200);
  } else {
    const ogt = meta("og:title");
    if (ogt) out.title = ogt;
  }

  // Author handle. The post page has links to /<handle>/ near the header;
  // the first such anchor inside <article> tends to be the post author.
  const handleAnchor = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ).find((a) => /^\/[A-Za-z0-9._]+\/?$/.test(new URL(a.href).pathname));
  if (handleAnchor) {
    const handle = new URL(handleAnchor.href).pathname.replace(/\//g, "");
    if (handle) out.author = `@${handle}`;
  }

  // Video first (autoplaying reel), then image.
  const video = article.querySelector<HTMLVideoElement>("video");
  if (video) {
    const src = video.currentSrc || video.src;
    if (src) {
      out.videoUrl = src;
      out.mediaType = "video";
      const poster = video.poster;
      out.mediaUrl = poster || src;
    }
  }
  if (!out.mediaUrl) {
    const img = article.querySelector<HTMLImageElement>(
      'img[srcset], img[src*="cdninstagram"], img[src*="fbcdn"]',
    );
    if (img) {
      const best = img.srcset ? pickLargestSrcset(img.srcset) : undefined;
      const src = best || img.currentSrc || img.src;
      if (src) {
        out.mediaUrl = src;
        out.mediaType = "image";
      }
    }
  }
  if (!out.mediaUrl) {
    const ogi = meta("og:image");
    if (ogi) {
      out.mediaUrl = ogi;
      out.mediaType = out.videoUrl ? "video" : "image";
    }
  }

  return out;
}

function scrapePinterest(): ScrapedSave {
  function meta(name: string): string | undefined {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="${name}"], meta[name="${name}"]`,
    );
    return el?.content?.trim() || undefined;
  }

  const out: ScrapedSave = {};
  const title = meta("og:title");
  const desc = meta("og:description");
  const image = meta("og:image");
  const author = meta("article:author") ?? meta("twitter:creator");
  if (title) out.title = title;
  if (desc) out.description = desc;
  if (image) {
    out.mediaUrl = image;
    out.mediaType = "image";
  }
  if (author) out.author = author;
  return out;
}
