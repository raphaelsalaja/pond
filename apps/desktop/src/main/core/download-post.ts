import type { Source } from "@pond/schema/db";
import { walkCaptureMedia } from "@pond/schema/raw";
import type { Capture } from "@pond/schema/raw";
import { sourceLabel } from "@pond/schema/sources";
import type { DownloadPostProbe } from "@shared/downloader-contracts";

const TITLE_LIMIT = 120;

function siteOf(source: Source, url: string): string {
  if (source !== "web") return sourceLabel(source);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function clip(line: string): string {
  return line.length > TITLE_LIMIT ? `${line.slice(0, TITLE_LIMIT)}…` : line;
}

/** The post's own media first; quoted and replied-to media only when it has none. */
function imagesOf(capture: Capture): Array<string> {
  const own =
    capture.media.length > 0 ? capture.media : walkCaptureMedia(capture);
  const images = own.flatMap((media) => {
    if (media.type === "image") return [media.url];
    return media.posterUrl ? [media.posterUrl] : [];
  });
  if (images.length === 0 && capture.card?.imageUrl) {
    images.push(capture.card.imageUrl);
  }
  return [...new Set(images)];
}

export function postProbeOf(
  capture: Capture,
  url: string,
  existingSaveId: string | null,
): DownloadPostProbe {
  const site = siteOf(capture.source, url);
  const text = capture.description?.trim() || null;
  const firstLine = text?.split("\n").find((line) => line.trim() !== "");
  return {
    kind: "post",
    url,
    source: capture.source,
    site,
    title: capture.title?.trim() || (firstLine ? clip(firstLine.trim()) : site),
    author: capture.author?.name ?? capture.author?.handle ?? null,
    text,
    images: imagesOf(capture),
    existingSaveId,
  };
}
