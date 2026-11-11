import { canRequestNativeThumbnail } from "../../shared/file-format";
import { isThumbnailFileExtension } from "../../shared/media-index";

const MIN_WIDTH = 32;
const MAX_WIDTH = 2048;

/** `foreground` is one item the user opened, `visible` an on-screen card, `background` work nobody waits on. */
export type ThumbnailPriority = "foreground" | "visible" | "background";

export const NATIVE_RASTER_EXT: ReadonlySet<string> = new Set([
  ".heic",
  ".heif",
]);

export function isThumbnailable(ext: string): boolean {
  return isThumbnailFileExtension(ext);
}

export function isIsoBaseMediaHeader(header: Uint8Array): boolean {
  return (
    header.byteLength >= 12 &&
    Buffer.from(header).toString("ascii", 4, 8) === "ftyp"
  );
}

export function isRasterImageHeader(header: Uint8Array): boolean {
  if (header.byteLength >= 2 && header[0] === 0xff && header[1] === 0xd8) {
    return true;
  }
  if (
    header.byteLength >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return true;
  }
  if (
    header.byteLength >= 12 &&
    Buffer.from(header).toString("ascii", 0, 4) === "RIFF" &&
    Buffer.from(header).toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  return isIsoBaseMediaHeader(header);
}

export function clampThumbWidth(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const w = Math.round(raw);
  if (w <= 0) return null;
  return Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);
}

export function createThumbnailScheduler(
  maxConcurrent: number,
  maxBackground = 2,
) {
  let active = 0;
  let backgroundActive = 0;
  const queues: Record<ThumbnailPriority, Array<() => void>> = {
    foreground: [],
    visible: [],
    background: [],
  };

  function drain(): void {
    while (active < maxConcurrent) {
      /** Visible work runs newest first: while the grid scrolls, the latest requests are the cards still on screen. */
      const next =
        queues.foreground.shift() ??
        queues.visible.pop() ??
        (backgroundActive < maxBackground
          ? queues.background.shift()
          : undefined);
      if (!next) return;
      next();
    }
  }

  async function run<T>(
    priority: ThumbnailPriority,
    task: () => Promise<T>,
  ): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        active += 1;
        if (priority === "background") backgroundActive += 1;
        resolve();
      };
      queues[priority].push(start);
      drain();
    });
    try {
      return await task();
    } finally {
      active -= 1;
      if (priority === "background") backgroundActive -= 1;
      drain();
    }
  }

  return { run };
}

export type ThumbnailKind = "sharp" | "native" | "sharp-or-native";

export function thumbnailKindForExtension(ext: string): ThumbnailKind | null {
  const lower = ext.toLowerCase();
  if (NATIVE_RASTER_EXT.has(lower)) return "native";
  if (lower === ".jxl" || lower === ".tif" || lower === ".tiff") {
    return "sharp-or-native";
  }
  if (isThumbnailable(lower)) return "sharp";
  if (canRequestNativeThumbnail(`preview${lower}`)) return "native";
  return null;
}
