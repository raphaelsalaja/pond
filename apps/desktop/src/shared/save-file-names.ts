export const THUMBNAIL_KIND = "thumbnail";
export const THUMBNAIL_DARK_KIND = "thumbnail_dark";
export const IMAGE_KIND = "image";
export const VIDEO_KIND = "video";
export const POSTER_KIND = "poster";
export const ARTICLE_KIND = "article";
export const ARTICLE_FILE = "article.html";
const AVATAR_KIND = "avatar";
const SOURCE_ICON_KIND = "source_icon";

const THUMBNAIL_WEBP_SUFFIX = "_thumbnail.webp";
const THUMBNAIL_PNG_SUFFIX = "_thumbnail.png";
export const TEXT_THUMBNAIL_FILE = "thumbnail.png";
export const TEXT_THUMBNAIL_WEBP_FILE = "thumbnail.webp";
export const THUMBNAIL_DARK_FILE = "thumbnail-dark.png";

const THUMBNAIL_KINDS: ReadonlySet<string> = new Set([
  THUMBNAIL_KIND,
  THUMBNAIL_DARK_KIND,
]);

export const AUXILIARY_KINDS: ReadonlySet<string> = new Set([
  ...THUMBNAIL_KINDS,
  AVATAR_KIND,
  SOURCE_ICON_KIND,
  POSTER_KIND,
  ARTICLE_KIND,
]);

export function isThumbnailKind(kind: string): boolean {
  return THUMBNAIL_KINDS.has(kind);
}

export function isAuxiliaryKind(kind: string): boolean {
  return AUXILIARY_KINDS.has(kind);
}

export const POST_RENDER_LIGHT_KIND = "tweet_screenshot_light";
export const POST_RENDER_DARK_KIND = "tweet_screenshot_dark";
const POST_RENDER_KIND = /^tweet_screenshot_(?:quote\d+_)?(?:light|dark)$/;

/** Rendered X and Threads post cards only stand in for a post that has no media of its own. */
export function isPostRenderKind(kind: string): boolean {
  return POST_RENDER_KIND.test(kind);
}

export function isOriginalImageKind(kind: string): boolean {
  return kind === IMAGE_KIND;
}

export function isThumbnailFilename(filename: string): boolean {
  const name = basenameOf(filename);
  const lower = name.toLowerCase();
  return (
    lower.endsWith(THUMBNAIL_WEBP_SUFFIX) ||
    lower.endsWith(THUMBNAIL_PNG_SUFFIX) ||
    name === TEXT_THUMBNAIL_FILE ||
    name === TEXT_THUMBNAIL_WEBP_FILE ||
    name === THUMBNAIL_DARK_FILE
  );
}

export function isTextCardThumbnailPath(path: string): boolean {
  const name = basenameOf(path);
  return (
    name === TEXT_THUMBNAIL_FILE ||
    name === TEXT_THUMBNAIL_WEBP_FILE ||
    name === THUMBNAIL_DARK_FILE
  );
}

export function hasMediaThumbnail(
  files: ReadonlyArray<{ kind: string; path: string }>,
): boolean {
  const hasOriginal = files.some((file) => !isAuxiliaryKind(file.kind));
  return files.some(
    (file) =>
      isThumbnailKind(file.kind) &&
      (!hasOriginal || !isTextCardThumbnailPath(file.path)),
  );
}

export function thumbnailFilename(originalFilename: string): string {
  return `${basenameOf(originalFilename)}${THUMBNAIL_WEBP_SUFFIX}`;
}

export function webpThumbnailFilename(existingFilename: string): string {
  const name = basenameOf(existingFilename);
  const extensionIndex = name.lastIndexOf(".");
  return `${extensionIndex > 0 ? name.slice(0, extensionIndex) : name}.webp`;
}

/** Existing Pond and Eagle sidecars still use the PNG suffix. */
export function thumbnailSidecarCandidates(originalFilename: string): string[] {
  const base = basenameOf(originalFilename);
  return [`${base}${THUMBNAIL_WEBP_SUFFIX}`, `${base}${THUMBNAIL_PNG_SUFFIX}`];
}

export function mediaFilename(index: number, ext: string): string {
  return `media-${index + 1}${ext}`;
}

export function videoFilename(index: number, ext: string): string {
  return `video-${index + 1}${ext}`;
}

export function posterFilename(index: number, ext: string): string {
  return `poster-${index + 1}${ext}`;
}

export function harvestedFilename(
  kind: "image" | "video",
  index: number,
  ext: string,
): string {
  return kind === "video"
    ? videoFilename(index, ext)
    : mediaFilename(index, ext);
}

export function assignHarvestedFilenames<T extends { filename: string }>(
  entries: Array<T | null>,
): Array<T | null> {
  let images = 0;
  let videos = 0;
  return entries.map((entry) => {
    if (!entry) return entry;
    const ext = extensionOf(entry.filename);
    if (isHarvestedVideoName(entry.filename)) {
      return { ...entry, filename: videoFilename(videos++, ext) };
    }
    return { ...entry, filename: mediaFilename(images++, ext) };
  });
}

export function inferKindFromFilename(filename: string): string {
  const name = basenameOf(filename);
  if (name === THUMBNAIL_DARK_FILE) return THUMBNAIL_DARK_KIND;
  if (isThumbnailFilename(name)) return THUMBNAIL_KIND;
  if (name.startsWith("poster")) return POSTER_KIND;
  if (name.startsWith("cover")) return IMAGE_KIND;
  if (name.startsWith("video")) return VIDEO_KIND;
  if (name.startsWith("media-")) return IMAGE_KIND;
  if (name.startsWith("avatar")) return AVATAR_KIND;
  if (name.startsWith("source-icon")) return SOURCE_ICON_KIND;
  if (name === "archive-manifest.json") return "archive_manifest";
  if (name.startsWith("archive")) return "archive";
  return "other";
}

export function primaryOriginalPath(
  files: ReadonlyArray<{ kind: string; path: string }>,
): string | null {
  const original = files.find((file) => !isAuxiliaryKind(file.kind));
  return original?.path ?? null;
}

export function pickCardFile<T extends { kind: string; path: string }>(
  files: readonly T[],
): T | null {
  const hasOriginal = files.some((file) => !isAuxiliaryKind(file.kind));
  const usableThumb = (file: T) =>
    isThumbnailKind(file.kind) &&
    (!hasOriginal || !isTextCardThumbnailPath(file.path));
  return (
    files.find((file) => file.kind === THUMBNAIL_KIND && usableThumb(file)) ??
    files.find(
      (file) => file.kind === THUMBNAIL_DARK_KIND && usableThumb(file),
    ) ??
    files.find(usableThumb) ??
    files.find((file) => file.kind === POSTER_KIND) ??
    files.find((file) => !isAuxiliaryKind(file.kind)) ??
    null
  );
}

function isHarvestedVideoName(filename: string): boolean {
  return basenameOf(filename).startsWith("video");
}

function basenameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1);
}

function extensionOf(filename: string): string {
  const name = basenameOf(filename);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return ".bin";
  return name.slice(dot).toLowerCase();
}
