import {
  IconClockOutline18,
  IconExpand2Outline18,
  IconEyeOutline18,
  IconGlobe2Outline18,
  IconHeightMaxOutline18,
  IconMsgOutline18,
  IconStorageOutline18,
  IconThumbsUpOutline18,
  IconUserOutline18,
  IconCalendarOutline18 as RowsCalendarIcon,
} from "@pond/icons/outline";
import type { ReactNode } from "react";
import type { Save } from "@/pool/types";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatShortDate,
  prettifyType,
} from "./helpers";

export interface PaneRow {
  id: string;
  icon: ReactNode;
  label: string;
  value: string;
}

const ICON_SIZE = 12;

export function collectMetadataRows(save: Save): PaneRow[] {
  const out: PaneRow[] = [];
  const raw = save.rawJson ?? null;

  const yt = raw?.youtube;
  const tw = raw?.twitter;
  const tt = raw?.tiktok;
  const ig = raw?.instagram;
  const ar = raw?.arena;
  const rd = raw?.reddit;

  const durationSec =
    yt?.durationSec ??
    tt?.durationSec ??
    yt?.ytdlp?.duration ??
    tt?.ytdlp?.duration ??
    null;
  if (durationSec && Number.isFinite(durationSec)) {
    out.push({
      id: "duration",
      icon: <IconClockOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Duration",
      value: formatDuration(durationSec),
    });
  }

  const views =
    yt?.metrics?.views ??
    tw?.metrics?.views ??
    tt?.metrics?.plays ??
    ig?.metrics?.plays ??
    null;
  if (views !== null && views !== undefined) {
    out.push({
      id: "views",
      icon: <IconEyeOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Views",
      value: formatCount(views),
    });
  }

  const likes =
    yt?.metrics?.likes ??
    tw?.metrics?.likes ??
    tt?.metrics?.likes ??
    ig?.metrics?.likes ??
    null;
  if (likes !== null && likes !== undefined) {
    out.push({
      id: "likes",
      icon: <IconThumbsUpOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Likes",
      value: formatCount(likes),
    });
  }

  const comments =
    tw?.metrics?.replies ??
    tt?.metrics?.comments ??
    ig?.metrics?.comments ??
    ar?.metrics?.comments ??
    rd?.metrics?.comments ??
    null;
  if (comments !== null && comments !== undefined) {
    out.push({
      id: "comments",
      icon: <IconMsgOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Comments",
      value: formatCount(comments),
    });
  }

  const publishedAt =
    yt?.publishedAt ??
    tw?.publishedAt ??
    tt?.publishedAt ??
    ig?.publishedAt ??
    ar?.publishedAt ??
    rd?.publishedAt ??
    null;
  if (publishedAt) {
    out.push({
      id: "published",
      icon: <RowsCalendarIcon width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Published",
      value: formatShortDate(publishedAt),
    });
  }

  return out;
}

export function collectPropertyRows(save: Save): PaneRow[] {
  const out: PaneRow[] = [];

  const type =
    save.mediaType ?? save.classification ?? (save.url ? "Link" : null);
  if (type) {
    out.push({
      id: "type",
      icon: <IconStorageOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Type",
      value: prettifyType(type),
    });
  }

  if (save.source) {
    out.push({
      id: "source",
      icon: <IconGlobe2Outline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Source",
      value: save.source,
    });
  }

  if (save.author) {
    out.push({
      id: "author",
      icon: <IconUserOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Author",
      value: save.author,
    });
  }

  if (save.savedAt) {
    out.push({
      id: "imported",
      icon: <RowsCalendarIcon width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Imported",
      value: formatShortDate(save.savedAt),
    });
  }

  const modified = save.embeddingUpdatedAt ?? save.createdAt;
  if (modified) {
    out.push({
      id: "modified",
      icon: <RowsCalendarIcon width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Modified",
      value: formatShortDate(modified),
    });
  }

  if (save.fileSize) {
    out.push({
      id: "size",
      icon: <IconExpand2Outline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Size",
      value: formatBytes(save.fileSize),
    });
  }

  if (save.width && save.height) {
    out.push({
      id: "dimensions",
      icon: <IconHeightMaxOutline18 width={ICON_SIZE} height={ICON_SIZE} />,
      label: "Dimensions",
      value: `${save.width} × ${save.height}`,
    });
  }

  return out;
}
