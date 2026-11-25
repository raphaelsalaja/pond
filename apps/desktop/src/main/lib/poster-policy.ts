import type { SaveFile } from "@pond/schema/db";
import { walkCaptureMedia } from "@pond/schema/raw";
import type { RawJson } from "@pond/schema/raw";
import { isVideoFile } from "@shared/media-index";

export { posterFilename, videoFilename } from "@shared/save-file-names";

export type PosterWrite = {
  kind: "poster";
  filename: string;
  bytes: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
};

export function hasMediaDims(
  dims: Pick<SaveFile, "width" | "height"> | null | undefined,
): boolean {
  return (
    dims !== null &&
    dims !== undefined &&
    dims.width !== null &&
    dims.width !== undefined &&
    dims.height !== null &&
    dims.height !== undefined &&
    Number.isFinite(dims.width) &&
    Number.isFinite(dims.height) &&
    dims.width > 0 &&
    dims.height > 0
  );
}

export { usesPlatformPoster } from "@shared/poster-policy";

export function videoPosterSlots(files: ReadonlyArray<SaveFile>) {
  const videos = files.filter(isVideoFile);
  const posters = files.filter((f) => f.kind === "poster");
  return { videos, posters };
}

export function posterRepairIndexes(
  files: ReadonlyArray<SaveFile>,
): Array<number> {
  const { videos, posters } = videoPosterSlots(files);
  const indexes: Array<number> = [];
  for (let index = 0; index < videos.length; index += 1) {
    if (!videos[index]) continue;
    if (!posters[index]) indexes.push(index);
  }
  return indexes;
}

export function needsPosterRepair(files: ReadonlyArray<SaveFile>): boolean {
  return posterRepairIndexes(files).length > 0;
}

export function youtubeThumbnailUrl(
  rawJson: RawJson | null | undefined,
): string | null {
  if (!rawJson) return null;
  if (rawJson.ytdlp?.thumbnail) return rawJson.ytdlp.thumbnail;

  const media = rawJson.capture?.media ?? [];
  for (const entry of media) {
    if (entry.posterUrl) return entry.posterUrl;
  }
  for (const entry of media) {
    if (
      entry.type !== "video" &&
      /ytimg\.com|i\.ytimg\.com|ggpht\.com/i.test(entry.url)
    ) {
      return entry.url;
    }
  }
  return null;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif)$/i;

function isImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return IMAGE_EXTENSIONS.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function remotePosterUrl(
  rawJson: RawJson | null | undefined,
  mediaUrl: string | null | undefined,
): string | null {
  const videos = walkCaptureMedia(rawJson?.capture).filter(
    (m) => m.type === "video",
  );
  if (videos.length === 0) return null;
  for (const m of videos) {
    if (m.posterUrl) return m.posterUrl;
  }
  if (rawJson?.ytdlp?.thumbnail) return rawJson.ytdlp.thumbnail;
  for (const m of videos) {
    if (isImageUrl(m.url)) return m.url;
  }
  return isImageUrl(mediaUrl) ? mediaUrl : null;
}
