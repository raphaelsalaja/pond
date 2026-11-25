type MediaIndexState =
  | "idle"
  | "indexing"
  | "paused-user"
  | "paused-system"
  | "complete"
  | "error";

export type MediaIndexPauseReason = "battery" | "active" | "thermal";

const THUMBNAIL_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".gif",
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
  "image/gif",
]);

export function isThumbnailFileExtension(extension: string): boolean {
  return THUMBNAIL_EXTENSIONS.has(extension.toLowerCase());
}

interface ThumbnailFileLike {
  kind: string;
  path: string;
  mimeType?: string | null;
}

export function isVideoFile(file: ThumbnailFileLike): boolean {
  if (file.kind === "video") return true;
  if (file.mimeType?.startsWith("video/") === true) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.path);
}

export function isStaticThumbnailFile(file: ThumbnailFileLike): boolean {
  const slash = Math.max(
    file.path.lastIndexOf("/"),
    file.path.lastIndexOf("\\"),
  );
  const dot = file.path.lastIndexOf(".");
  const extension = dot > slash ? file.path.slice(dot).toLowerCase() : "";
  const mimeType = file.mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (extension === ".svg" || mimeType === "image/svg+xml") {
    return false;
  }
  if (
    isThumbnailFileExtension(extension) ||
    THUMBNAIL_MIME_TYPES.has(mimeType)
  ) {
    return true;
  }
  return (
    (file.kind === "cover" ||
      file.kind === "poster" ||
      file.kind === "thumbnail" ||
      file.kind === "image") &&
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
/** Bump when preview generation changes to expire disk and renderer derivatives. */
export const THUMBNAIL_CACHE_VERSION = 2;
