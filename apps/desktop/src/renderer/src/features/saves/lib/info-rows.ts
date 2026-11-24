import { normalizeListKinds } from "@pond/schema/list-kinds";
import {
  deriveTypeLabel,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";
import { listKindLabel } from "@/features/sources/list-kind";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatTimestampLine,
} from "@/shared/lib/format";
import { prettifyType } from "./presentation";

interface PaneRow {
  id: string;
  label: string;
  value: string;
}

export function collectInfoRows(save: Save): PaneRow[] {
  const out: PaneRow[] = [];

  const primary = pickPrimaryFile(save);
  const type = deriveTypeLabel(primary, save);
  if (type) {
    out.push({
      id: "type",
      label: "Type",
      value: prettifyType(type),
    });
  }

  const kinds = normalizeListKinds(save.listKinds);
  if (kinds.length) {
    out.push({
      id: "list",
      label: "List",
      value: kinds.map((kind) => listKindLabel(save.source, kind)).join(", "),
    });
  }

  const capture = save.rawJson?.capture;
  const ytdlp = save.rawJson?.ytdlp;

  const durationSec =
    capture?.duration ??
    capture?.media.find((m) => m.type === "video")?.durationSec ??
    ytdlp?.duration ??
    null;
  if (durationSec && Number.isFinite(durationSec)) {
    out.push({
      id: "duration",
      label: "Duration",
      value: formatDuration(durationSec),
    });
  }

  const metrics = capture?.metrics ?? {};
  const views = metrics.views ?? metrics.plays ?? ytdlp?.view_count ?? null;
  if (views !== null && views !== undefined) {
    out.push({
      id: "views",
      label: "Views",
      value: formatCount(views),
    });
  }

  const likes = metrics.likes ?? ytdlp?.like_count ?? null;
  if (likes !== null && likes !== undefined) {
    out.push({
      id: "likes",
      label: "Likes",
      value: formatCount(likes),
    });
  }

  const comments =
    metrics.comments ?? metrics.replies ?? ytdlp?.comment_count ?? null;
  if (comments !== null && comments !== undefined) {
    out.push({
      id: "comments",
      label: "Comments",
      value: formatCount(comments),
    });
  }

  if (metrics.retweets !== null && metrics.retweets !== undefined) {
    out.push({
      id: "retweets",
      label: "Reposts",
      value: formatCount(metrics.retweets),
    });
  }

  if (metrics.quotes !== null && metrics.quotes !== undefined) {
    out.push({
      id: "quotes",
      label: "Quotes",
      value: formatCount(metrics.quotes),
    });
  }

  const bookmarks = metrics.bookmarks ?? metrics.saves ?? null;
  if (bookmarks !== null && bookmarks !== undefined) {
    out.push({
      id: "bookmarks",
      label: "Bookmarks",
      value: formatCount(bookmarks),
    });
  }

  if (metrics.shares !== null && metrics.shares !== undefined) {
    out.push({
      id: "shares",
      label: "Shares",
      value: formatCount(metrics.shares),
    });
  }

  if (save.width && save.height) {
    out.push({
      id: "dimensions",
      label: "Dimensions",
      value: `${save.width} × ${save.height}`,
    });
  }

  if (save.fileSize) {
    out.push({
      id: "size",
      label: "Size",
      value: formatBytes(save.fileSize),
    });
  }

  if (save.container) {
    out.push({ id: "container", label: "Container", value: save.container });
  }
  if (save.videoCodec) {
    out.push({
      id: "videoCodec",
      label: "Video Codec",
      value: save.videoCodec,
    });
  }
  if (save.audioCodec) {
    out.push({
      id: "audioCodec",
      label: "Audio Codec",
      value: save.audioCodec,
    });
  }
  if (save.bitrate) {
    out.push({
      id: "bitrate",
      label: "Bitrate",
      value: `${Math.round(save.bitrate / 1000)} kbps`,
    });
  }
  if (save.colorSpace) {
    out.push({
      id: "colorSpace",
      label: "Color Space",
      value: save.colorSpace,
    });
  }
  if (save.cameraMake) {
    out.push({ id: "cameraMake", label: "Make", value: save.cameraMake });
  }
  if (save.cameraModel) {
    out.push({ id: "cameraModel", label: "Camera", value: save.cameraModel });
  }
  if (save.lensModel) {
    out.push({ id: "lensModel", label: "Lens", value: save.lensModel });
  }
  if (save.focalLength) {
    out.push({
      id: "focalLength",
      label: "Focal Length",
      value: `${save.focalLength} mm`,
    });
  }
  if (save.aperture) {
    out.push({
      id: "aperture",
      label: "Aperture",
      value: `ƒ/${save.aperture}`,
    });
  }
  if (save.exposureTime) {
    out.push({
      id: "exposureTime",
      label: "Exposure",
      value: `${save.exposureTime} s`,
    });
  }
  if (save.iso) {
    out.push({ id: "iso", label: "ISO", value: String(save.iso) });
  }
  if (save.takenAt) {
    out.push({
      id: "taken",
      label: "Taken",
      value: formatTimestampLine(save.takenAt),
    });
  }

  if (capture?.publishedAt) {
    out.push({
      id: "published",
      label: "Published",
      value: formatTimestampLine(capture.publishedAt),
    });
  }

  if (save.savedAt) {
    out.push({
      id: "imported",
      label: "Imported",
      value: formatTimestampLine(save.savedAt),
    });
  }

  if (save.createdAt) {
    out.push({
      id: "modified",
      label: "Modified",
      value: formatTimestampLine(save.createdAt),
    });
  }

  return out;
}
