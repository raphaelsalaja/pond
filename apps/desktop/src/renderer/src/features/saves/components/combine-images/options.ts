import { CombineImagesOptionsSchema } from "@shared/combine-images-contracts";
import type { CombineImagesOptions } from "@shared/combine-images-contracts";
import { libraryScopedKey } from "@/shared/lib/library-scope";

type Direction = CombineImagesOptions["direction"];
export type SizeKey = "width" | "height";
export type Highlight = "margin" | "spacing" | null;

const STORAGE_KEY = libraryScopedKey("combineImages");

const DEFAULT_OPTIONS = CombineImagesOptionsSchema.parse({
  direction: "vertical",
  alignment: "stretch",
  width: 1200,
});

export const LIMITS = {
  size: [1, 32_768],
  spacing: [0, 4096],
} as const satisfies Record<string, readonly [number, number]>;

export const QUALITIES = Array.from({ length: 19 }, (_, index) => {
  const value = 100 - index * 5;
  return { value, label: String(value) };
});

function sanitize(options: CombineImagesOptions): CombineImagesOptions {
  return { ...options, outputPath: null, deleteOriginals: false };
}

export function readStoredOptions(): CombineImagesOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = CombineImagesOptionsSchema.safeParse({
      ...DEFAULT_OPTIONS,
      ...JSON.parse(raw),
    });
    return parsed.success ? sanitize(parsed.data) : DEFAULT_OPTIONS;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function storeOptions(options: CombineImagesOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(options)));
  } catch {
    /** Storage can be full or blocked; the options still apply for this session. */
  }
}

/** The cross axis is listed first because it anchors the scale. */
export function sizeKeys(direction: Direction): readonly [SizeKey, SizeKey] {
  return direction === "vertical" ? ["width", "height"] : ["height", "width"];
}

/** Keeps the cross-axis size when the stack turns, so the images keep their scale. */
export function withDirection(
  options: CombineImagesOptions,
  direction: Direction,
): CombineImagesOptions {
  if (direction === options.direction) return options;
  return {
    ...options,
    direction,
    width: options.height,
    height: options.width,
  };
}

export function withSize(
  options: CombineImagesOptions,
  key: SizeKey,
  value: number,
): CombineImagesOptions {
  return {
    ...options,
    width: key === "width" ? value : null,
    height: key === "height" ? value : null,
  };
}

export function supportsTransparency(
  format: CombineImagesOptions["format"],
): boolean {
  return format !== "jpeg";
}
