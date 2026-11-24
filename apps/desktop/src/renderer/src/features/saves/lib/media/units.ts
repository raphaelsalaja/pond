import type { TweetCover } from "@pond/schema/db";
import { webTypeKey } from "@pond/schema/media-type";
import {
  classifyLibraryFile,
  requiresGeneratedImagePreview,
  typeLabelForPath,
} from "@shared/file-format";
import { isVideoFile } from "@shared/media-index";
import {
  ARTICLE_KIND,
  isAuxiliaryKind,
  isOriginalImageKind,
  isPostRenderKind,
  isTextCardThumbnailPath,
  isThumbnailKind,
  POSTER_KIND,
  rendersPostCard,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import {
  RENDER_TEXT_COVER_VERSION,
  textCoverVersionFromRawJson,
} from "@shared/text-card";
import { hasArchive, isArchiveFile } from "@/features/saves/lib/media/archive";
import { richFilePreviewKind } from "@/features/saves/lib/media/rich-file-preview";
import {
  buildPondUrl,
  previewThumbUrlFor,
  previewUrlFor,
} from "@/features/saves/lib/media/url";
import {
  arenaBlockClass,
  isTextOnlyAsideFromCover,
  textBodyForSave,
} from "@/features/saves/lib/text";
import type { Save, SaveFile } from "@/features/saves/types";
import { resolveCurrentTheme } from "@/shared/hooks/use-resolved-theme";
import type { ResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { getPrefsSnapshot } from "@/shared/state/prefs";

const TWEET_SCREENSHOT_LIGHT_KIND = "tweet_screenshot_light";
const TWEET_SCREENSHOT_DARK_KIND = "tweet_screenshot_dark";

export interface MediaUnit {
  key: string;
  url: string;
  isVideo: boolean;
  posterUrl?: string;
  posterKey?: string;
  requiresGeneratedPreview?: boolean;
}

export interface MediaPickOptions {
  theme?: ResolvedTheme;
  tweetCover?: TweetCover;
}

function isRenderableVideoFile(file: SaveFile): boolean {
  return (
    isVideoFile(file) &&
    classifyLibraryFile(file.path, file.mimeType).previewKind === "video"
  );
}

function resolveCurrentTweetCover(): TweetCover {
  return getPrefsSnapshot()?.preferences?.tweetCover ?? "media";
}

export function buildMediaUnits(
  save: Save,
  opts: MediaPickOptions = {},
): Array<MediaUnit> {
  const units = buildOriginalMediaUnits(save);
  if (units.length > 0) {
    return units;
  }

  const screenshot = pickTweetScreenshot(save, opts.theme);
  return screenshot
    ? [
        {
          key: screenshot.path,
          url: buildPondUrl(save.id, screenshot),
          isVideo: false,
        },
      ]
    : [];
}

/** The Save's own photos and videos, without the rendered post card that stands in for text-only posts. */
export function buildOriginalMediaUnits(save: Save): Array<MediaUnit> {
  const allFiles = save.files ?? [];
  const posters = allFiles.filter((f) => f.kind === "poster");
  const files = allFiles.filter(
    (f) =>
      !isAuxiliaryKind(f.kind) &&
      !isArchiveFile(f) &&
      !isPostRenderKind(f.kind),
  );

  const videos = files.filter(isRenderableVideoFile);
  const images = files.filter(isImageFile);

  /** A harvested post ships a cover image beside a lone video; every file in a local Save is one the user chose. */
  const imageIsCover =
    images.length === 0 || (images.length === 1 && save.source !== "local");
  if (videos.length === 1 && imageIsCover) {
    const video = videos[0];
    if (!video) {
      return [];
    }
    const poster = posters[0] ?? images[0];
    const unit: MediaUnit = {
      key: video.path,
      url: buildPondUrl(save.id, video),
      isVideo: true,
    };
    if (poster) {
      unit.posterUrl = buildPondUrl(save.id, poster);
      unit.posterKey = poster.path;
    }
    return [unit];
  }

  const units: Array<MediaUnit> = [];
  let videoSeen = 0;
  for (const f of files) {
    if (isRenderableVideoFile(f)) {
      const poster = posters[videoSeen] ?? posters[0];
      const unit: MediaUnit = {
        key: f.path,
        url: buildPondUrl(save.id, f),
        isVideo: true,
      };
      if (poster) {
        unit.posterUrl = buildPondUrl(save.id, poster);
        unit.posterKey = poster.path;
      }
      units.push(unit);
      videoSeen++;
    } else if (isImageFile(f)) {
      const unit: MediaUnit = {
        key: f.path,
        url: buildPondUrl(save.id, f),
        isVideo: false,
      };
      if (requiresGeneratedImagePreview(f.path)) {
        unit.requiresGeneratedPreview = true;
      }
      units.push(unit);
    }
  }
  return units;
}

export function pickPrimaryUnit(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit | null {
  const mode = opts.tweetCover ?? resolveCurrentTweetCover();
  const screenshot = pickTweetScreenshot(save, opts.theme);
  if (screenshot && mode === "screenshot") {
    return {
      key: screenshot.path,
      url: buildPondUrl(save.id, screenshot),
      isVideo: false,
    };
  }

  const units = buildMediaUnits(save, opts);
  const video = units.find((u) => u.isVideo);
  if (video) {
    return video;
  }
  return units[0] ?? null;
}

export function pickCardUnit(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit | null {
  const mode = opts.tweetCover ?? resolveCurrentTweetCover();
  if (mode === "screenshot") {
    const screenshot = pickTweetScreenshot(save, opts.theme);
    if (screenshot) {
      return {
        key: screenshot.path,
        url: buildPondUrl(save.id, screenshot),
        isVideo: false,
      };
    }
  }

  const thumbnail = pickThumbnailFile(save, opts.theme);
  if (thumbnail) {
    const unit: MediaUnit = {
      key: thumbnail.path,
      url: buildPondUrl(save.id, thumbnail),
      isVideo: false,
    };
    if (requiresGeneratedImagePreview(thumbnail.path)) {
      unit.requiresGeneratedPreview = true;
    }
    return unit;
  }

  const primary = pickPrimaryUnit(save, opts);
  if (primary) {
    return primary;
  }

  const poster = (save.files ?? []).find((file) => file.kind === POSTER_KIND);
  if (poster) {
    return {
      key: poster.path,
      url: buildPondUrl(save.id, poster),
      isVideo: false,
    };
  }

  const previewable = (save.files ?? []).find((file) => {
    if (isAuxiliaryFile(file)) {
      return false;
    }
    const kind = classifyLibraryFile(file.path, file.mimeType).previewKind;
    return (
      kind === "audio" ||
      kind === "pdf" ||
      kind === "font" ||
      kind === "generic"
    );
  });
  return previewable
    ? {
        key: previewable.path,
        url: buildPondUrl(save.id, previewable),
        isVideo: false,
        requiresGeneratedPreview: true,
      }
    : null;
}

export function detailsPreviewUrl(unit: MediaUnit | null): string | null {
  if (!unit) {
    return null;
  }
  if (unit.isVideo) {
    return unit.posterUrl ?? null;
  }
  return unit.requiresGeneratedPreview
    ? previewThumbUrlFor(unit.url, 560)
    : unit.url;
}

/** Full-size URL of the image the Save's Library card shows, or null when the card draws a live file preview instead. */
export function cardThumbnailUrl(
  save: Save,
  opts: MediaPickOptions = {},
): string | null {
  const hasThumbnail = (save.files ?? []).some((file) =>
    isThumbnailKind(file.kind),
  );
  if (!hasThumbnail && richFilePreviewKind(pickPrimaryFile(save, opts))) {
    return null;
  }
  const unit = pickCardUnit(save, opts);
  if (!unit) {
    return null;
  }
  if (unit.isVideo) {
    return unit.posterUrl ?? null;
  }
  return unit.requiresGeneratedPreview ? previewUrlFor(unit.url) : unit.url;
}

export function pickPrimaryFile(
  save: Save,
  opts: MediaPickOptions = {},
): SaveFile | null {
  const unit = pickPrimaryUnit(save, opts);
  if (unit) {
    const file = (save.files ?? []).find((f) => f.path === unit.key);
    if (file) {
      return file;
    }
  }
  return (save.files ?? []).find((file) => !isAuxiliaryFile(file)) ?? null;
}

function isAuxiliaryFile(file: SaveFile): boolean {
  return (
    isAuxiliaryKind(file.kind) ||
    isArchiveFile(file) ||
    isPostRenderKind(file.kind)
  );
}

function pickThumbnailFile(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  const files = save.files ?? [];
  const hasOriginal = files.some(
    (file) => !isAuxiliaryFile(file) || isPostRenderKind(file.kind),
  );
  const usable = (file: SaveFile) =>
    isThumbnailKind(file.kind) &&
    (!hasOriginal || !isTextCardThumbnailPath(file.path));
  const resolved = theme ?? resolveCurrentTheme();
  const preferred = resolved === "dark" ? THUMBNAIL_DARK_KIND : THUMBNAIL_KIND;
  const other = resolved === "dark" ? THUMBNAIL_KIND : THUMBNAIL_DARK_KIND;
  return (
    files.find((file) => file.kind === preferred && usable(file)) ??
    files.find((file) => file.kind === other && usable(file)) ??
    null
  );
}

function pickTweetScreenshot(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  if (!rendersPostCard(save.source)) {
    return null;
  }
  const files = save.files ?? [];
  const resolved = theme ?? resolveCurrentTheme();
  const preferredKind =
    resolved === "light"
      ? TWEET_SCREENSHOT_LIGHT_KIND
      : TWEET_SCREENSHOT_DARK_KIND;
  const otherKind =
    resolved === "light"
      ? TWEET_SCREENSHOT_DARK_KIND
      : TWEET_SCREENSHOT_LIGHT_KIND;
  return (
    files.find((f) => f.kind === preferredKind) ??
    files.find((f) => f.kind === otherKind) ??
    null
  );
}

export function needsTextCover(save: Save): boolean {
  if (rendersPostCard(save.source)) {
    return false;
  }
  if (hasArchive(save)) {
    return false;
  }
  if (!textBodyForSave(save)) {
    return false;
  }
  if (!isTextOnlyAsideFromCover(save)) {
    return false;
  }
  const hasThumb = (save.files ?? []).some((file) =>
    isThumbnailKind(file.kind),
  );
  if (!hasThumb) {
    return true;
  }
  return textCoverVersionFromRawJson(save.rawJson) < RENDER_TEXT_COVER_VERSION;
}

export function isImageFile(file: SaveFile): boolean {
  if (isOriginalImageKind(file.kind)) {
    return true;
  }
  const previewKind = classifyLibraryFile(file.path, file.mimeType).previewKind;
  return previewKind === "direct-image" || previewKind === "native-image";
}

type TypeKind =
  | "image"
  | "video"
  | "audio"
  | "font"
  | "link"
  | "text"
  | "doc"
  | "other";

export function deriveTypeKind(file: SaveFile | null, save: Save): TypeKind {
  if (save.source === "web") {
    return "link";
  }

  if (file) {
    const format = classifyLibraryFile(file.path, file.mimeType);
    if (format.mediaType === "image") {
      return "image";
    }
    if (format.mediaType === "video") {
      return "video";
    }
    if (format.mediaType === "audio") {
      return "audio";
    }
    if (format.mediaType === "font") {
      return "font";
    }
    if (format.mediaType === "document") {
      return "doc";
    }
    if (format.mediaType === "text") {
      return "text";
    }
    if (isOriginalImageKind(file.kind)) {
      return "image";
    }
  }

  const media = save.mediaType?.toLowerCase();
  if (media === "text") {
    return "text";
  }
  if (media === "image") {
    return "image";
  }
  if (media === "video") {
    return "video";
  }
  if (media === "audio") {
    return "audio";
  }
  if (media === "document") {
    return "doc";
  }
  if (media === "font") {
    return "font";
  }
  if (media === "file") {
    return "other";
  }
  if (media === "link") {
    return "link";
  }

  return save.url ? "link" : "other";
}

export function deriveTypeLabel(
  file: SaveFile | null,
  save: Save,
): string | null {
  if (save.source === "web") {
    return webTypeKey(save) === "product" ? "Product" : "Web";
  }
  if (save.source === "github") {
    return "Repository";
  }
  if (save.files.some((f) => f.kind === ARTICLE_KIND)) {
    return "Article";
  }
  if (arenaBlockClass(save) === "text") {
    return "Text";
  }
  if (
    !file &&
    !hasArchive(save) &&
    textBodyForSave(save).length > 0 &&
    isTextOnlyAsideFromCover(save)
  ) {
    return "Text";
  }
  const extensionLabel = file ? typeLabelForPath(file.path) : null;
  if (extensionLabel) {
    return extensionLabel;
  }
  const subtype = file?.mimeType?.split("/")[1]?.split(";")[0];
  if (subtype) {
    return subtype.toUpperCase();
  }
  const media = save.mediaType?.toLowerCase();
  if (media === "text") {
    return "Text";
  }
  if (media === "video") {
    return "Video";
  }
  if (media === "image") {
    return "Image";
  }
  if (media === "link") {
    return "Website";
  }
  if (save.mediaType) {
    return save.mediaType.toUpperCase();
  }
  return save.url ? "Link" : null;
}
