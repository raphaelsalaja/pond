import { isStaticThumbnailFile } from "@shared/media-index";
import type { MediaUnit } from "@/lib/media/units";
import type { Save } from "@/lib/types";

/** Returns the local still that represents a card, including a video's poster. */
export function cardPreviewSource(save: Save, unit: MediaUnit): string | null {
  const src = unit.isVideo ? unit.posterUrl : unit.url;
  const key = unit.isVideo ? unit.posterKey : unit.key;
  if (!src || !key) return null;
  const file = save.files.find((candidate) => candidate.path === key);
  return file && isStaticThumbnailFile(file) ? src : null;
}
