export type MediaIndexState =
  | "idle"
  | "indexing"
  | "paused-user"
  | "paused-system"
  | "complete"
  | "error";

export type MediaIndexPauseReason = "battery" | "active" | "thermal";

/** Width buckets shared by the background sweep and renderer cache requests. */
export const CARD_THUMB_WIDTH = 768;
export const CARD_LQIP_WIDTH = 32;
/** Smallest first so an interrupted sweep still improves first paint. */
export const CARD_INDEX_WIDTHS = [CARD_LQIP_WIDTH, CARD_THUMB_WIDTH] as const;

const THUMBNAIL_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
]);
const THUMBNAIL_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export function isThumbnailFileExtension(extension: string): boolean {
  return THUMBNAIL_EXTENSIONS.has(extension.toLowerCase());
}

interface ThumbnailFileLike {
  kind: string;
  path: string;
  mimeType?: string | null;
}

/** True when a local still can use the WebP thumbnail/LQIP cache. */
export function isStaticThumbnailFile(file: ThumbnailFileLike): boolean {
  const slash = Math.max(
    file.path.lastIndexOf("/"),
    file.path.lastIndexOf("\\"),
  );
  const dot = file.path.lastIndexOf(".");
  const extension = dot > slash ? file.path.slice(dot).toLowerCase() : "";
  const mimeType = file.mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (
    extension === ".gif" ||
    extension === ".svg" ||
    mimeType === "image/gif" ||
    mimeType === "image/svg+xml"
  ) {
    return false;
  }
  if (
    isThumbnailFileExtension(extension) ||
    THUMBNAIL_MIME_TYPES.has(mimeType)
  ) {
    return true;
  }
  /** Legacy cover/poster imports can omit both extension and MIME; byte sniffing validates them later. */
  return (
    (file.kind === "cover" || file.kind === "poster") &&
    (extension === "" || extension === ".")
  );
}

export interface MediaIndexStatus {
  state: MediaIndexState;
  prepared: number;
  remaining: number;
  currentTitle: string | null;
  pauseReason: MediaIndexPauseReason | null;
  lastError: string | null;
}
