import type { Source } from "@pond/schema/db";

export interface ScrapedMedia {
  url: string;
  type?: "image" | "video" | "link";
  poster?: string;
  width?: number;
  height?: number;
}

export interface ScrapedSave {
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "link";
  mediaUrls?: ScrapedMedia[];
  videoUrl?: string;
}

export function scrapeFnFor(source: Source): (() => ScrapedSave) | null {
  switch (source) {
    case "instagram":
      return scrapeInstagram;
    case "pinterest":
      return scrapePinterest;
    case "cosmos":
      return scrapeCosmos;
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
        return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
      })
      .filter((p) => p.u);
    if (!parts.length) return undefined;
    parts.sort((a, b) => b.w - a.w);
    return parts[0]?.u;
  }

  const out: ScrapedSave = {};
  const article = document.querySelector("article") ?? document.body;
  const media: ScrapedMedia[] = [];
  const seen = new Set<string>();
  const pushMedia = (m: ScrapedMedia | undefined) => {
    if (!m?.url || seen.has(m.url)) return;
    seen.add(m.url);
    media.push(m);
  };

  const caption =
    meta("og:description") ??
    article.querySelector("h1")?.textContent?.trim() ??
    article.querySelector("[data-testid='post-caption']")?.textContent?.trim();
  if (caption) {
    out.description = caption;
    out.title = caption.replace(/\s+/g, " ").slice(0, 200);
  } else {
    const ogt = meta("og:title");
    if (ogt) out.title = ogt;
  }

  const handleAnchor = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ).find((a) => /^\/[A-Za-z0-9._]+\/?$/.test(new URL(a.href).pathname));
  if (handleAnchor) {
    const handle = new URL(handleAnchor.href).pathname.replace(/\//g, "");
    if (handle) out.author = `@${handle}`;
  }

  const videos = Array.from(
    article.querySelectorAll<HTMLVideoElement>("video"),
  );
  for (const video of videos) {
    const src = video.currentSrc || video.src;
    if (src) {
      pushMedia({ url: src, type: "video", poster: video.poster || undefined });
    } else if (video.poster) {
      pushMedia({ url: video.poster, type: "image" });
    }
  }

  const imgs = Array.from(
    article.querySelectorAll<HTMLImageElement>(
      'img[srcset], img[src*="cdninstagram"], img[src*="fbcdn"]',
    ),
  );
  for (const img of imgs) {
    const best = img.srcset ? pickLargestSrcset(img.srcset) : undefined;
    const src = best || img.currentSrc || img.src;
    if (src) pushMedia({ url: src, type: "image" });
  }

  if (media.length === 0) {
    const ogi = meta("og:image");
    if (ogi) pushMedia({ url: ogi, type: "image" });
  }

  if (media.length > 0) {
    out.mediaUrls = media;
    out.mediaUrl = media[0]?.url;
    out.mediaType = media[0]?.type ?? "image";
    const firstVideo = media.find((m) => m.type === "video");
    if (firstVideo) {
      out.videoUrl = firstVideo.url;
      out.mediaType = "video";
    }
  }

  return out;
}

function scrapeCosmos(): ScrapedSave {
  function meta(name: string): string | undefined {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="${name}"], meta[name="${name}"]`,
    );
    return el?.content?.trim() || undefined;
  }

  const out: ScrapedSave = {};
  const media: ScrapedMedia[] = [];
  const seen = new Set<string>();
  const pushMedia = (m: ScrapedMedia | undefined) => {
    if (!m?.url || seen.has(m.url)) return;
    seen.add(m.url);
    media.push(m);
  };

  const title = meta("og:title") ?? document.title?.trim();
  if (title) out.title = title;
  const desc = meta("og:description");
  if (desc) out.description = desc;
  const author = meta("article:author") ?? meta("twitter:creator");
  if (author) out.author = author;

  const root = document.querySelector("main") ?? document.body;
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>("video"));
  for (const video of videos) {
    const src = video.currentSrc || video.src;
    if (src)
      pushMedia({ url: src, type: "video", poster: video.poster || undefined });
    else if (video.poster) pushMedia({ url: video.poster, type: "image" });
  }

  const imgs = Array.from(
    root.querySelectorAll<HTMLImageElement>(
      'img[srcset], img[src*="cosmos.so"], img[src*="imgix.net"]',
    ),
  );
  for (const img of imgs) {
    const src = img.currentSrc || img.src;
    if (src) pushMedia({ url: src, type: "image" });
  }

  const ogVideo = meta("og:video") ?? meta("og:video:url");
  if (ogVideo) pushMedia({ url: ogVideo, type: "video" });
  const ogImage = meta("og:image");
  if (ogImage) pushMedia({ url: ogImage, type: "image" });

  if (media.length > 0) {
    out.mediaUrls = media;
    out.mediaUrl = media[0]?.url;
    out.mediaType = media[0]?.type ?? "image";
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
