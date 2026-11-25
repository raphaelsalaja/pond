import type { RawImage } from "@huggingface/transformers";
import { pickPrimaryUnit } from "@/features/saves/media";
import type { Save } from "@/features/saves/types";

export function representativeImageUrl(save: Save): string | null {
  const unit = pickPrimaryUnit(save);
  if (!unit) return null;
  return unit.isVideo ? (unit.posterUrl ?? null) : unit.url;
}

/** img crossOrigin is rejected for the pond:// scheme, so fetch the bytes and hand the Blob to transformers.js. */
export async function loadImage(url: string): Promise<RawImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${url}`);
  const { RawImage } = await import("@huggingface/transformers");
  return RawImage.fromBlob(await res.blob());
}
