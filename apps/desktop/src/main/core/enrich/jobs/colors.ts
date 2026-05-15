import { readFile } from "node:fs/promises";
import type { DominantColor, Save } from "@pond/schema/db";
import log from "electron-log/main.js";
import { itemFile } from "../../../paths";

export interface CoverAnalysis {
  dominantColors: DominantColor[];
  blurDataUrl: string | null;
  width: number;
  height: number;
}

export async function analyseCover(save: Save): Promise<CoverAnalysis | null> {
  const cover = pickCoverFile(save);
  if (!cover) return null;
  const path = itemFile(save.id, cover);
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (err) {
    log.warn("[pond enrich/colors] could not read cover", save.id, err);
    return null;
  }

  const { nativeImage } = await import("electron");
  const decoded = nativeImage.createFromBuffer(buf);
  if (decoded.isEmpty()) return null;
  const size = decoded.getSize();
  if (size.width === 0 || size.height === 0) return null;

  const dominantColors = extractDominantColorsFromBitmap(decoded);
  const blurDataUrl = makeBlurDataUrl(decoded, size);
  if (dominantColors.length === 0 && !blurDataUrl) return null;
  return {
    dominantColors,
    blurDataUrl,
    width: size.width,
    height: size.height,
  };
}

export async function extractDominantColors(
  save: Save,
): Promise<DominantColor[] | null> {
  const result = await analyseCover(save);
  if (!result) return null;
  return result.dominantColors.length > 0 ? result.dominantColors : null;
}

function extractDominantColorsFromBitmap(
  source: Electron.NativeImage,
): DominantColor[] {
  const targetW = 64;
  const size = source.getSize();
  const targetH = Math.max(1, Math.round((size.height / size.width) * targetW));
  const img = source.resize({
    width: targetW,
    height: targetH,
    quality: "good",
  });
  const bitmap = img.toBitmap();
  if (bitmap.length === 0) return [];

  const isBgra = process.platform === "darwin" || process.platform === "win32";
  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    const a = bitmap[i + 3] ?? 255;
    if (a < 32) continue;
    const r = isBgra ? (bitmap[i + 2] ?? 0) : (bitmap[i] ?? 0);
    const g = bitmap[i + 1] ?? 0;
    const b = isBgra ? (bitmap[i] ?? 0) : (bitmap[i + 2] ?? 0);
    const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  if (buckets.size === 0) return [];
  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 6);
  const totalCount = top.reduce((acc, x) => acc + x.count, 0);
  if (totalCount === 0) return [];
  return top.map((bucket) => ({
    hex: `#${rgbToHex(
      Math.round(bucket.r / bucket.count),
      Math.round(bucket.g / bucket.count),
      Math.round(bucket.b / bucket.count),
    )}`,
    weight: bucket.count / totalCount,
  }));
}

function makeBlurDataUrl(
  source: Electron.NativeImage,
  size: { width: number; height: number },
): string | null {
  try {
    const longEdge = 16;
    const ratio = size.width / size.height;
    const w = ratio >= 1 ? longEdge : Math.max(1, Math.round(longEdge * ratio));
    const h = ratio >= 1 ? Math.max(1, Math.round(longEdge / ratio)) : longEdge;
    const tiny = source.resize({ width: w, height: h, quality: "good" });
    const jpeg = tiny.toJPEG(35);
    if (jpeg.length === 0) return null;
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (err) {
    log.warn("[pond enrich/colors] blur preview failed", err);
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `${clamp(r).toString(16).padStart(2, "0")}${clamp(g)
    .toString(16)
    .padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function pickCoverFile(save: Save): string | null {
  const files = save.files ?? [];
  if (files.length === 0) return null;
  const visual = files.find((f) => {
    if (typeof f.path !== "string") return false;
    const lower = f.path.toLowerCase();
    if (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov")
    ) {
      return false;
    }
    return true;
  });
  return visual?.path ?? null;
}
