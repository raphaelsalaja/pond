import type { Save, SaveFile } from "./types";
import { buildPondUrl } from "./url";

/**
 * Renderer-side pairing of a save's on-disk files into "logical media
 * units" that the carousel + grid both render off the same shape.
 *
 * Why pairing exists: when a save has both a video and its still
 * frame (yt-dlp downloads the MP4, the harvester captured the poster
 * JPG before that), the renderer should treat them as one slide:
 * `<video poster=cover.jpg src=video.mp4>`. Otherwise the user sees
 * the same image as a static slide AND as a slide that auto-plays.
 *
 * Pairing key: positional. The first `video` file pairs with the
 * first `cover` file. Multi-video tweets are rare; if/when they
 * happen we can revisit (e.g. match by basename `video-N.mp4` →
 * `media-N.jpg`).
 *
 * `MediaUnit.url` is always the URL the renderer should bind to
 * `<img src>` or `<video src>`. `posterUrl` is set only for video
 * units that have a sibling poster — the renderer passes it as
 * `<video poster={posterUrl}>` so the still paints before the user
 * hits play.
 */

export interface MediaUnit {
  /** Stable across reorders / renames so React `key` props are happy. */
  key: string;
  /** Primary URL — `<img src>` or `<video src>`. */
  url: string;
  /** True if this unit should render as `<video>`, false for `<img>`. */
  isVideo: boolean;
  /** When set, render as `<video poster={posterUrl}>`. Optional. */
  posterUrl?: string;
}

/**
 * Walk the save's files and produce one MediaUnit per logical slide.
 * Filters out avatars (drawn separately as author chrome) and folds
 * each video together with its sibling cover image.
 */
export function buildMediaUnits(save: Save): MediaUnit[] {
  const files = (save.files ?? []).filter((f) => f.kind !== "avatar");

  // Bucket the files so the pairing is order-independent of how the
  // executor wrote them. We've historically written cover before
  // video, but a future refresh could flip that order.
  const videos: SaveFile[] = [];
  const covers: SaveFile[] = [];
  const others: SaveFile[] = [];
  for (const f of files) {
    if (isVideoFile(f)) videos.push(f);
    else if (f.kind === "cover" || f.kind === "media") covers.push(f);
    else others.push(f);
  }

  const consumedCovers = new Set<string>();
  const units: MediaUnit[] = [];

  // Pair every video with the next available cover, in declaration
  // order. Videos without a poster sibling still render — the
  // `<video>` element paints its own first frame from the bytes.
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (!v) continue;
    const poster = covers[i];
    if (poster) consumedCovers.add(poster.path);
    units.push({
      key: v.path,
      url: buildPondUrl(save.id, v),
      isVideo: true,
      posterUrl: poster ? buildPondUrl(save.id, poster) : undefined,
    });
  }

  // Remaining covers (no paired video) become standalone image slides.
  for (const c of covers) {
    if (consumedCovers.has(c.path)) continue;
    units.push({
      key: c.path,
      url: buildPondUrl(save.id, c),
      isVideo: false,
    });
  }

  // `other` files (kind="other" / unknown) ride at the end. They're
  // rare — typically downloads we couldn't classify — and the renderer
  // treats them as images by default; consumers that care can read
  // the file's mimeType to tell.
  for (const o of others) {
    units.push({
      key: o.path,
      url: buildPondUrl(save.id, o),
      isVideo: false,
    });
  }

  return units;
}

/**
 * Pick the single MediaUnit to render in the grid card. Order of
 * preference (matches what the user expects when a save has multiple
 * pieces of media):
 *   1. First video (with poster, if available) — so playback is the
 *      headline experience for video saves.
 *   2. First image — the historical default.
 *   3. None (the caller's fallback to placeholder applies).
 */
export function pickPrimaryUnit(save: Save): MediaUnit | null {
  const units = buildMediaUnits(save);
  const video = units.find((u) => u.isVideo);
  if (video) return video;
  return units[0] ?? null;
}

function isVideoFile(file: SaveFile): boolean {
  if (file.kind === "video") return true;
  if (file.mimeType?.startsWith("video/") === true) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.path);
}
