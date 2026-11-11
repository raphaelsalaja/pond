import { THUMBNAIL_CACHE_VERSION } from "@shared/media-index";
import type { Save, SaveFile } from "@/features/saves/types";

/** Encodes each path segment so spaces, `#`, `?`, and `%` survive the pond:// URL. */
export function pondFileUrl(saveId: string, filePath: string): string {
  const path = filePath.split("/").map(encodeURIComponent).join("/");
  return `pond://${saveId}/${path}`;
}

export function buildPondUrl(saveId: string, file: SaveFile): string {
  const base = pondFileUrl(saveId, file.path);
  const bust = cacheBuster(file);
  return bust ? `${base}?v=${bust}` : base;
}

/** Buckets hold the thumbnail cache to a few sizes per file rather than one per zoom step. */
const THUMB_BUCKETS = [256, 384, 512, 768, 1024] as const;
const THUMB_MAX = 1536;
/** Main clamps `tw` to 2048, so the sharpest step stops there. */
const SHARPER_BUCKETS = [...THUMB_BUCKETS, THUMB_MAX, 2048] as const;

export function thumbUrlFor(url: string, cssWidth: number | undefined): string {
  const width = thumbnailWidth(cssWidth);
  return width ? withThumbWidth(url, width) : url;
}

/** One bucket above `thumbUrlFor`, so Quality sharpens a card without decoding its original. */
export function sharperThumbUrlFor(
  url: string,
  cssWidth: number | undefined,
): string {
  const width = thumbnailWidth(cssWidth);
  if (!width) return url;
  const sharper = SHARPER_BUCKETS.find((bucket) => bucket > width) ?? width;
  return withThumbWidth(url, sharper);
}

function withThumbWidth(url: string, width: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}tw=${width}&tv=${THUMBNAIL_CACHE_VERSION}`;
}

/** Waits for a renderer-safe WebP when Chromium cannot decode the original. */
export function previewUrlFor(url: string, width = 2048): string {
  return `${url}${url.includes("?") ? "&" : "?"}preview=${width}&tv=${THUMBNAIL_CACHE_VERSION}`;
}

export function previewThumbUrlFor(
  url: string,
  cssWidth: number | undefined,
): string {
  return previewUrlFor(url, thumbnailWidth(cssWidth) ?? 1024);
}

function thumbnailWidth(cssWidth: number | undefined): number | null {
  if (!cssWidth || cssWidth <= 0) return null;
  const wanted = cssWidth * (globalThis.devicePixelRatio || 1);
  return THUMB_BUCKETS.find((bucket) => bucket >= wanted) ?? THUMB_MAX;
}

export function pickAuthorAvatarUrl(save: Save): string | null {
  const local = (save.files ?? []).find((f) => f.kind === "avatar");
  if (local) return buildPondUrl(save.id, local);

  const url = save.rawJson?.capture?.author?.avatarUrl;
  return url && url.trim().length > 0 ? url : null;
}

export function pickSourceIconUrl(save: Save): string | null {
  const local = (save.files ?? []).find((f) => f.kind === "source_icon");
  if (local) return buildPondUrl(save.id, local);

  const url = save.rawJson?.capture?.extras?.faviconUrl;
  return url && url.trim().length > 0 ? url : null;
}

function cacheBuster(file: SaveFile): string | null {
  if (file.sha256 && file.sha256.length >= 8) {
    return file.sha256.slice(0, 12);
  }
  return null;
}
