import type { ImageCrop } from "@pond/schema/db";
import type { CSSProperties } from "react";
import type { Save } from "@/features/saves/types";
import { rotationSwapsAxes } from "./image-orientation";

export function mediaTransformStyle(save: Save): CSSProperties {
  const parts: string[] = [];
  if (save.rotate) parts.push(`rotate(${save.rotate}deg)`);
  if (save.flipX) parts.push("scaleX(-1)");
  if (save.flipY) parts.push("scaleY(-1)");
  const style: CSSProperties = {};
  if (parts.length > 0) style.transform = parts.join(" ");
  if (save.crop) style.clipPath = cropClip(save.crop);
  return style;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Library frames use the oriented aspect. A quarter turn sizes the thumb to
 * the pixel box, centered in that frame, then rotates it so the image fills the tile.
 */
export function orientedThumbStyle(
  save: Save,
  pixelAspect: number | null,
): CSSProperties {
  const style = mediaTransformStyle(save);
  if (
    !rotationSwapsAxes(save.rotate) ||
    pixelAspect == null ||
    !(pixelAspect > 0)
  ) {
    return style;
  }
  return {
    ...style,
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${rounded(pixelAspect * 100)}%`,
    height: "auto",
    aspectRatio: String(rounded(pixelAspect)),
    transformOrigin: "center center",
    transform: style.transform
      ? `translate(-50%, -50%) ${style.transform}`
      : "translate(-50%, -50%)",
  };
}

function cropClip(crop: ImageCrop): string {
  const left = Math.max(0, Math.min(100, crop.x * 100));
  const top = Math.max(0, Math.min(100, crop.y * 100));
  const right = Math.max(0, Math.min(100, 100 - (crop.x + crop.w) * 100));
  const bottom = Math.max(0, Math.min(100, 100 - (crop.y + crop.h) * 100));
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}
