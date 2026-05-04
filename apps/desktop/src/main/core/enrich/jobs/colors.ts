import { readFile } from "node:fs/promises";
import type { DominantColor, Save } from "@pond/schema/db";
import log from "electron-log/main.js";
import { itemFile } from "../../../paths";

/**
 * Always-local dominant-colour extraction. Decodes the cover image with
 * Electron's `nativeImage` (no extra native deps required), downsamples
 * to 64x64, quantises to a 4-bit-per-channel histogram, and returns the
 * top N most common colours by weight.
 *
 * Cheap (~30ms per image on M-series) and never touches the network.
 */
export async function extractDominantColors(
  save: Save,
): Promise<DominantColor[] | null> {
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

  // `nativeImage` is the cheapest decoder we have access to from main
  // without pulling sharp. It handles JPEG / PNG / WebP and returns
  // raw RGBA bytes after a downscale.
  const { nativeImage } = await import("electron");
  let img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) return null;
  const size = img.getSize();
  if (size.width === 0 || size.height === 0) return null;

  const targetW = 64;
  const targetH = Math.max(1, Math.round((size.height / size.width) * targetW));
  img = img.resize({ width: targetW, height: targetH, quality: "good" });
  const bitmap = img.getBitmap();
  if (bitmap.length === 0) return null;

  // Electron returns BGRA on macOS/Windows, RGBA on Linux. Test the
  // first pixel against a known orientation: we don't have one, so just
  // probe the platform.
  const isBgra = process.platform === "darwin" || process.platform === "win32";

  // Quantise to 5 bits per channel (32 buckets) — gives ~32k bins, plenty
  // for 64x64 imagery.
  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    const a = bitmap[i + 3] ?? 255;
    if (a < 32) continue; // mostly-transparent
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
  if (buckets.size === 0) return null;
  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 6);
  const totalCount = top.reduce((acc, x) => acc + x.count, 0);
  if (totalCount === 0) return null;
  const result: DominantColor[] = top.map((bucket) => ({
    hex: `#${rgbToHex(
      Math.round(bucket.r / bucket.count),
      Math.round(bucket.g / bucket.count),
      Math.round(bucket.b / bucket.count),
    )}`,
    weight: bucket.count / totalCount,
  }));
  return result;
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
  // Prefer cover/poster/image files; skip plain `.mp4` because nativeImage
  // can't decode video.
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
