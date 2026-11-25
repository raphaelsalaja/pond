import type {
  ConversionCapability,
  ConversionFormat,
  ConversionPreset,
} from "@shared/conversion-contracts";
import { classifyLibraryFile } from "@shared/file-format";
import type { SaveFile } from "@/features/saves/types";

export type SizeMode = "original" | "width" | "height" | "long-edge" | "box";

export const SIZE_ITEMS: Array<{ value: SizeMode; label: string }> = [
  { value: "original", label: "Original" },
  { value: "width", label: "Max Width" },
  { value: "height", label: "Max Height" },
  { value: "long-edge", label: "Max Long Edge" },
  { value: "box", label: "Max Width and Height" },
];

const DEFAULT_EDGE = 1920;

type Box = Pick<ConversionPreset, "width" | "height">;

export interface Dimensions {
  width: number;
  height: number;
}

export function sizeModeFor({ width, height }: Box): SizeMode {
  if (width === null && height === null) return "original";
  if (height === null) return "width";
  if (width === null) return "height";
  return width === height ? "long-edge" : "box";
}

export function boxForMode(mode: SizeMode, current: Box): Box {
  const edge = current.width ?? current.height ?? DEFAULT_EDGE;
  switch (mode) {
    case "original":
      return { width: null, height: null };
    case "width":
      return { width: edge, height: null };
    case "height":
      return { width: null, height: edge };
    case "long-edge":
      return { width: edge, height: edge };
    case "box":
      return { width: current.width ?? edge, height: current.height ?? edge };
  }
}

/** Matches the export's `fit: inside` resize, which never enlarges. */
export function fitInside(width: number, height: number, box: Box): Dimensions {
  const scale = Math.min(
    1,
    box.width ? box.width / width : 1,
    box.height ? box.height / height : 1,
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Sharp only decodes images; FFmpeg formats also accept video sources. */
export function canConvert(
  file: SaveFile,
  capability: ConversionCapability | undefined,
): boolean {
  const { mediaType } = classifyLibraryFile(file.path, file.mimeType);
  if (mediaType === "image") return true;
  return mediaType === "video" && capability?.adapter === "ffmpeg";
}

export function formatLabel(format: ConversionFormat): string {
  switch (format) {
    case "animated-webp":
      return "Animated WebP";
    case "apng":
      return "Animated PNG";
    case "jpeg":
      return "JPG";
    case "webp":
      return "WebP";
    case "webm":
      return "WebM";
    case "jxl":
      return "JPEG XL";
    default:
      return format.toUpperCase();
  }
}
