import type { Save } from "@pond/schema/db";

const VERCEL_BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i;

/**
 * Reads the canonical playable video URL out of a save's rawJson.
 * Prefers our mirrored Vercel Blob copy when present, falling back to the
 * original CDN URL (which may be ephemeral, e.g. signed Instagram links).
 */
export function getVideoUrl(save: Pick<Save, "rawJson">): string | null {
  const raw = save.rawJson as Record<string, unknown> | null;
  if (!raw) return null;
  if (typeof raw.videoBlobUrl === "string") return raw.videoBlobUrl;
  if (typeof raw.videoUrl === "string") return raw.videoUrl;
  return null;
}

export type GalleryItem = {
  type: "image" | "video";
  url: string;
  videoUrl?: string;
  blobUrl?: string;
  videoBlobUrl?: string;
};

/**
 * Pull the carousel/gallery payload out of `rawJson.gallery`. Returns null
 * when the save isn't a multi-item carousel.
 */
export function getGallery(
  save: Pick<Save, "rawJson">,
): GalleryItem[] | null {
  const raw = save.rawJson as Record<string, unknown> | null;
  const arr = raw?.gallery;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: GalleryItem[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const url = typeof e.url === "string" ? e.url : null;
    if (!url) continue;
    const type = e.type === "video" ? "video" : "image";
    const videoUrl = typeof e.videoUrl === "string" ? e.videoUrl : undefined;
    const blobUrl = typeof e.blobUrl === "string" ? e.blobUrl : undefined;
    const videoBlobUrl =
      typeof e.videoBlobUrl === "string" ? e.videoBlobUrl : undefined;
    out.push({ type, url, videoUrl, blobUrl, videoBlobUrl });
  }
  return out.length > 0 ? out : null;
}

/**
 * Pick the best image URL for a gallery item — mirrored copy first, raw
 * URL as fallback.
 */
export function bestImage(item: GalleryItem): string {
  return item.blobUrl ?? item.url;
}

/**
 * Pick the best playable video URL for a gallery item.
 */
export function bestVideo(item: GalleryItem): string | null {
  return item.videoBlobUrl ?? item.videoUrl ?? null;
}

/**
 * Wrap an upstream media URL with our same-origin proxy if needed. Mirrored
 * Vercel Blob URLs are returned untouched — they're CORS-open, durable, and
 * fast enough that the proxy hop is wasted work. Only un-mirrored CDN URLs
 * (Twitter video, hot Instagram links) need the proxy to bypass anti-hotlink
 * checks.
 */
export function proxyMedia(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/media")) return url;
  try {
    const parsed = new URL(url, "http://placeholder");
    if (VERCEL_BLOB_HOST_RE.test(parsed.hostname)) return url;
  } catch {
    /* fall through to proxying */
  }
  return `/api/media?url=${encodeURIComponent(url)}`;
}
