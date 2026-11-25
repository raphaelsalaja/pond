import type { RawJson } from "./raw";

/** Type key for a web save: shop item pages are products, everything else is a link. */
export function webTypeKey(save: {
  rawJson?: RawJson | null;
}): "product" | "link" {
  return save.rawJson?.capture?.extras?.product === true ? "product" : "link";
}

/** Majority type; image wins ties so carousels stay filterable without a mixed bucket. */
export function majorityMediaType(
  kinds: ReadonlyArray<"image" | "video">,
): "image" | "video" | null {
  if (kinds.length === 0) return null;
  let videos = 0;
  let images = 0;
  for (const kind of kinds) {
    if (kind === "video") videos += 1;
    else images += 1;
  }
  return videos > images ? "video" : "image";
}
