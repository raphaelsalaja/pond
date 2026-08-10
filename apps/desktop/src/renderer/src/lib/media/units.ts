import type { TweetCover } from "@pond/schema/db";
import {
  RENDER_TEXT_COVER_VERSION,
  TEXT_COVER_DARK_KIND,
  TEXT_COVER_KINDS,
  TEXT_COVER_LIGHT_KIND,
  textCoverVersionFromRawJson,
} from "@shared/text-card";
import {
  type ResolvedTheme,
  resolveCurrentTheme,
} from "@/hooks/use-resolved-theme";
import { hasArchive, isArchiveFile } from "@/lib/media/archive";
import { buildPondUrl } from "@/lib/media/url";
import {
  arenaBlockClass,
  isTextOnlyAsideFromCover,
  textBodyForSave,
} from "@/lib/save/text";
import type { Save, SaveFile } from "@/lib/types";
import { getPrefsSnapshot } from "@/stores/prefs";

/** Mirrors capture-tweet.ts kind constants, inlined since the renderer can't reach the main bundle. */
const TWEET_SCREENSHOT_LEGACY_KIND = "tweet_screenshot";
const TWEET_SCREENSHOT_LIGHT_KIND = "tweet_screenshot_light";
const TWEET_SCREENSHOT_DARK_KIND = "tweet_screenshot_dark";

const TWEET_SCREENSHOT_KINDS: ReadonlySet<string> = new Set([
  TWEET_SCREENSHOT_LEGACY_KIND,
  TWEET_SCREENSHOT_LIGHT_KIND,
  TWEET_SCREENSHOT_DARK_KIND,
]);

/** Quote-tweet screenshots, suffixed with 1-based depth, e.g. tweet_screenshot_quote1_light. */
const QUOTE_SCREENSHOT_KIND = /^tweet_screenshot_quote(\d+)_(light|dark)$/;

function isQuoteScreenshotKind(kind: string): boolean {
  return QUOTE_SCREENSHOT_KIND.test(kind);
}

export interface MediaUnit {
  key: string;
  url: string;
  isVideo: boolean;
  posterUrl?: string;
  posterKey?: string;
}

interface MediaPickOptions {
  theme?: ResolvedTheme;
  tweetCover?: TweetCover;
}

/** Tweet-cover mode for callers outside React; React callers should pass `tweetCover` so the UI re-picks on change. */
function resolveCurrentTweetCover(): TweetCover {
  return getPrefsSnapshot()?.preferences?.tweetCover ?? "media";
}

export function buildMediaUnits(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit[] {
  /** Drop thumbnail/metadata assets: tweet/text covers, quote screenshots (appended later), avatars, source icons, and site-archive files (rendered by the archive viewer). */
  const files = (save.files ?? []).filter(
    (f) =>
      f.kind !== "avatar" &&
      f.kind !== "source_icon" &&
      !isArchiveFile(f) &&
      !TWEET_SCREENSHOT_KINDS.has(f.kind) &&
      !TEXT_COVER_KINDS.has(f.kind) &&
      !isQuoteScreenshotKind(f.kind),
  );
  const posters = files.filter((f) => f.kind === "poster");
  const covers = files.filter((f) => f.kind === "cover");
  const withoutPosters = files.filter((f) => f.kind !== "poster");
  const hasVideo = withoutPosters.some(isVideoFile);
  /** A cover is a video poster when video exists; for image-only saves it is the media itself. */
  const slides = hasVideo
    ? withoutPosters.filter((f) => f.kind !== "cover")
    : withoutPosters;

  /** Quote-tweet screenshots are appended after the parent's extracted media. */
  const quoteUnits = buildQuoteScreenshotUnits(save, opts.theme);

  const videos = slides.filter(isVideoFile);
  const images = slides.filter(isImageFile);

  /** Single-stream save: one video + optional cover collapses to one unit with the cover as poster. */
  if (videos.length === 1 && images.length <= 1 && quoteUnits.length === 0) {
    const video = videos[0];
    if (!video) return [];
    const poster = posters[0] ?? covers[0] ?? images[0];
    return [
      {
        key: video.path,
        url: buildPondUrl(save.id, video),
        isVideo: true,
        ...(poster
          ? {
              posterUrl: buildPondUrl(save.id, poster),
              posterKey: poster.path,
            }
          : {}),
      },
    ];
  }

  const units: MediaUnit[] = [];
  let videoSeen = 0;
  for (const f of slides) {
    if (isVideoFile(f)) {
      /** Use the first imported poster until the background sweep fills per-video poster slots. */
      const poster = posters[videoSeen] ?? posters[0] ?? covers[0];
      units.push({
        key: f.path,
        url: buildPondUrl(save.id, f),
        isVideo: true,
        ...(poster
          ? {
              posterUrl: buildPondUrl(save.id, poster),
              posterKey: poster.path,
            }
          : {}),
      });
      videoSeen++;
    } else if (isImageFile(f)) {
      units.push({
        key: f.path,
        url: buildPondUrl(save.id, f),
        isVideo: false,
      });
    }
  }
  units.push(...quoteUnits);
  if (units.length > 0) return units;

  /** Twitter saves with no extracted media fall back to the tweet screenshot so the frame isn't blank. */
  const screenshot = pickTweetScreenshot(save, opts.theme);
  if (screenshot) {
    return [
      {
        key: screenshot.path,
        url: buildPondUrl(save.id, screenshot),
        isVideo: false,
      },
      ...quoteUnits,
    ];
  }

  /** Text-only saves fall back to the rasterized text cover so thumbs/detail can scale like images. */
  const textCover = pickTextCover(save, opts.theme);
  if (textCover) {
    return [
      {
        key: textCover.path,
        url: buildPondUrl(save.id, textCover),
        isVideo: false,
      },
    ];
  }
  return units;
}

/** One slide per quoted tweet, theme-matched with the other theme as fallback, ordered by depth. */
function buildQuoteScreenshotUnits(
  save: Save,
  theme: ResolvedTheme | undefined,
): MediaUnit[] {
  if (save.source !== "twitter") return [];
  const files = save.files ?? [];
  const resolved = theme ?? resolveCurrentTheme();

  const byDepth = new Map<number, { light?: SaveFile; dark?: SaveFile }>();
  for (const f of files) {
    const m = QUOTE_SCREENSHOT_KIND.exec(f.kind);
    if (!m) continue;
    const depth = Number.parseInt(m[1] ?? "", 10);
    if (!Number.isFinite(depth)) continue;
    const slot = byDepth.get(depth) ?? {};
    if (m[2] === "light") slot.light = f;
    else slot.dark = f;
    byDepth.set(depth, slot);
  }

  const units: MediaUnit[] = [];
  for (const depth of Array.from(byDepth.keys()).sort((a, b) => a - b)) {
    const slot = byDepth.get(depth);
    if (!slot) continue;
    const preferred = resolved === "light" ? slot.light : slot.dark;
    const file = preferred ?? slot.light ?? slot.dark;
    if (!file) continue;
    units.push({
      key: file.path,
      url: buildPondUrl(save.id, file),
      isVideo: false,
    });
  }
  return units;
}

/** The unit driving thumbnails/pane covers; for Twitter, `tweetCover` picks screenshot vs extracted media. */
export function pickPrimaryUnit(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit | null {
  const mode = opts.tweetCover ?? resolveCurrentTweetCover();
  const screenshot = pickTweetScreenshot(save, opts.theme);
  /** "screenshot" forces the tweet card; "media" falls through, with the screenshot still the text-only fallback. */
  if (screenshot && mode === "screenshot") {
    return {
      key: screenshot.path,
      url: buildPondUrl(save.id, screenshot),
      isVideo: false,
    };
  }

  const units = buildMediaUnits(save, opts);
  const video = units.find((u) => u.isVideo);
  if (video) return video;
  return units[0] ?? null;
}

/** Like pickPrimaryUnit but returns the SaveFile (for dimensions); matches by path since key is the disk path. */
export function pickPrimaryFile(
  save: Save,
  opts: MediaPickOptions = {},
): SaveFile | null {
  const unit = pickPrimaryUnit(save, opts);
  if (!unit) return null;
  return (save.files ?? []).find((f) => f.path === unit.key) ?? null;
}

/** Matching theme, then the other, then legacy; null for non-twitter. */
function pickTweetScreenshot(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  if (save.source !== "twitter") return null;
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
    files.find((f) => f.kind === TWEET_SCREENSHOT_LEGACY_KIND) ??
    null
  );
}

/** Matching theme, then the other; null when no text cover has been rendered yet. */
function pickTextCover(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  const files = save.files ?? [];
  const resolved = theme ?? resolveCurrentTheme();
  const preferredKind =
    resolved === "light" ? TEXT_COVER_LIGHT_KIND : TEXT_COVER_DARK_KIND;
  const otherKind =
    resolved === "light" ? TEXT_COVER_DARK_KIND : TEXT_COVER_LIGHT_KIND;
  return (
    files.find((f) => f.kind === preferredKind) ??
    files.find((f) => f.kind === otherKind) ??
    null
  );
}

/** True when a text-only save still needs its cover PNGs generated or refreshed. */
export function needsTextCover(save: Save): boolean {
  if (save.source === "twitter") return false;
  if (hasArchive(save)) return false;
  if (!textBodyForSave(save)) return false;
  if (!isTextOnlyAsideFromCover(save)) return false;
  const cover = pickTextCover(save, undefined);
  if (!cover) return true;
  return textCoverVersionFromRawJson(save.rawJson) < RENDER_TEXT_COVER_VERSION;
}

function isVideoFile(file: SaveFile): boolean {
  if (file.kind === "video") return true;
  if (file.mimeType?.startsWith("video/") === true) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.path);
}

/** Extension/mime only; kind stays out because tweet screenshots and posters are images too. */
export function isImageFile(file: SaveFile): boolean {
  if (file.kind === "cover") return true;
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.test(ext)) return true;
  return file.mimeType?.startsWith("image/") === true;
}

/** Broad category for the primary asset, used to color the type badge. */
type TypeKind = "image" | "video" | "audio" | "link" | "text" | "doc" | "other";

const IMAGE_EXT = /^(png|jpe?g|gif|webp|avif|heic|heif|svg|bmp|tiff?|ico)$/;
const VIDEO_EXT = /^(mp4|webm|mov|m4v|mkv|avi|gifv|ogv)$/;
const AUDIO_EXT = /^(mp3|wav|flac|aac|ogg|oga|m4a|opus)$/;
const DOC_EXT = /^(pdf|docx?|txt|md|markdown|rtf|csv|tsv|xlsx?|pptx?|epub)$/;

export function deriveTypeKind(file: SaveFile | null, save: Save): TypeKind {
  if (file && TEXT_COVER_KINDS.has(file.kind)) return "text";
  if (file?.kind === "cover") return "image";

  const ext = file?.path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.test(ext)) return "image";
  if (VIDEO_EXT.test(ext)) return "video";
  if (AUDIO_EXT.test(ext)) return "audio";
  if (DOC_EXT.test(ext)) return "doc";

  const mime = file?.mimeType?.split("/")[0]?.toLowerCase();
  if (mime === "image") return "image";
  if (mime === "video") return "video";
  if (mime === "audio") return "audio";

  const media = save.mediaType?.toLowerCase();
  if (media === "text") return "text";
  if (media === "image") return "image";
  if (media === "video") return "video";
  if (media === "audio") return "audio";
  if (media === "link") return "link";

  return save.url ? "link" : "other";
}

/** Badge label for the primary asset: extension, then mime subtype, then mediaType, then "Link". */
export function deriveTypeLabel(
  file: SaveFile | null,
  save: Save,
): string | null {
  if (file && TEXT_COVER_KINDS.has(file.kind)) return "Text";
  if (arenaBlockClass(save) === "text") return "Text";
  if (
    !file &&
    !hasArchive(save) &&
    textBodyForSave(save).length > 0 &&
    isTextOnlyAsideFromCover(save)
  ) {
    return "Text";
  }
  const ext = file?.path.split(".").pop()?.toLowerCase();
  if (ext && /^[a-z0-9]{1,4}$/.test(ext)) return ext.toUpperCase();
  const subtype = file?.mimeType?.split("/")[1]?.split(";")[0];
  if (subtype) return subtype.toUpperCase();
  const media = save.mediaType?.toLowerCase();
  if (media === "text") return "Text";
  if (media === "video") return "Video";
  if (media === "image") return "Image";
  if (media === "link") return "Website";
  if (save.mediaType) return save.mediaType.toUpperCase();
  return save.url ? "Link" : null;
}
