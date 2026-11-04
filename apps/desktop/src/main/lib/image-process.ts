import { extname } from "node:path";
import type { ImageDownloadSettings, ImageFormat } from "@pond/schema/db";
import log from "electron-log/main.js";
import sharp, { type Sharp } from "sharp";

type ImageEncodeSettings = Omit<ImageDownloadSettings, "splitPosts">;

interface ProcessedImage {
  bytes: Buffer;
  mimeType: string;
  filename: string;
  width?: number;
  height?: number;
}

const TARGET_EXT = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  avif: ".avif",
} satisfies Record<Exclude<ImageFormat, "original">, string>;

const TARGET_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
} satisfies Record<Exclude<ImageFormat, "original">, string>;

export async function processImage(
  bytes: Buffer,
  filename: string,
  mimeType: string | undefined,
  prefs: ImageEncodeSettings,
): Promise<ProcessedImage | null> {
  if (mimeType && !mimeType.startsWith("image/")) return null;

  const nothingToDo =
    prefs.maxLongEdge === null &&
    prefs.format === "original" &&
    !prefs.preserveMetadata;
  if (nothingToDo) return null;

  try {
    const pipeline = sharp(bytes, { failOn: "none" });
    const metadata = await pipeline.metadata();
    if ((metadata.pages ?? 1) > 1) return null;

    if (prefs.maxLongEdge !== null) {
      pipeline.resize(prefs.maxLongEdge, prefs.maxLongEdge, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (prefs.format !== "original") {
      applyFormat(pipeline, prefs);
    }

    if (prefs.preserveMetadata) pipeline.withMetadata();

    const { data: outBytes, info } = await pipeline.toBuffer({
      resolveWithObject: true,
    });
    const dims = dimsFromMeta(info);

    if (prefs.format === "original") {
      return {
        bytes: outBytes,
        mimeType: mimeType ?? mimeFromSharp(metadata.format),
        filename,
        ...dims,
      };
    }

    const ext = TARGET_EXT[prefs.format];
    return {
      bytes: outBytes,
      mimeType: TARGET_MIME[prefs.format],
      filename: replaceExt(filename, ext),
      ...dims,
    };
  } catch (err) {
    log.warn("[pond image-process] failed, keeping original", filename, err);
    return null;
  }
}

/** Resolves null when the image decodes without dimensions; rejects when the bytes are not a readable image. */
export async function probeImageDims(
  bytes: Buffer,
): Promise<{ width: number; height: number } | null> {
  if (bytes.subarray(0, 4).equals(ICO_HEADER)) return icoDims(bytes);
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  const dims = dimsFromMeta(meta);
  return dims.width && dims.height
    ? { width: dims.width, height: dims.height }
    : null;
}

const ICO_HEADER = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const ICO_ENTRY_BYTES = 16;

/* sharp has no ICO decoder, and web saves fall back to the site favicon as their cover. Read the largest icon's size from the directory instead; a size byte of 0 means 256. Throws like sharp does when an entry points outside the file. */
function icoDims(bytes: Buffer): { width: number; height: number } {
  const count = bytes.byteLength >= 6 ? bytes.readUInt16LE(4) : 0;
  if (count === 0 || bytes.byteLength < 6 + count * ICO_ENTRY_BYTES) {
    throw new Error("ICO directory is truncated");
  }
  let largest = { width: 0, height: 0 };
  for (let i = 0; i < count; i++) {
    const at = 6 + i * ICO_ENTRY_BYTES;
    const size = bytes.readUInt32LE(at + 8);
    const offset = bytes.readUInt32LE(at + 12);
    if (size === 0 || offset + size > bytes.byteLength) {
      throw new Error("ICO entry points outside the file");
    }
    const width = bytes[at] || 256;
    const height = bytes[at + 1] || 256;
    if (width * height > largest.width * largest.height) {
      largest = { width, height };
    }
  }
  return largest;
}

interface ImageDims {
  width?: number;
  height?: number;
}

function dimsFromMeta(meta: ImageDims): ImageDims {
  const { width, height } = meta;
  if (!width || !height) return {};
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

function applyFormat(pipeline: Sharp, prefs: ImageEncodeSettings): void {
  switch (prefs.format) {
    case "jpeg":
      pipeline.jpeg({ quality: prefs.quality, progressive: prefs.progressive });
      break;
    case "png":
      pipeline.png({ progressive: prefs.progressive, compressionLevel: 6 });
      break;
    case "webp":
      pipeline.webp({ quality: prefs.quality, lossless: prefs.lossless });
      break;
    case "avif":
      pipeline.avif({ quality: prefs.quality, lossless: prefs.lossless });
      break;
    default:
      break;
  }
}

function replaceExt(filename: string, ext: string): string {
  const current = extname(filename);
  const base = current ? filename.slice(0, -current.length) : filename;
  return `${base}${ext}`;
}

function mimeFromSharp(format: string | undefined): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
