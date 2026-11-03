import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { type Save, type SaveFile, saves } from "@pond/schema/db";
import type { Transaction, TxSaveFile } from "@pond/schema/tx";
import { THUMBNAIL_KIND, webpThumbnailFilename } from "@shared/save-file-names";
import { inArray } from "drizzle-orm";
import pLimit from "p-limit";
import sharp from "sharp";
import type { ImageCompressionRequest } from "../../shared/conversion-contracts";
import { getDb } from "../db";
import { encodeBlurhash } from "../lib/blurhash";
import { extractPalette } from "../lib/palette";
import { resolvePaths, saveDirIn } from "../paths";
import { executeBatch } from "./executor";
import { renderThumbnail } from "./save-thumbnail-file";
import { readLibraryMedia } from "./storage/library-media-storage";
import { recordBatchForUndo } from "./undo";

type CompressionSave = Pick<
  Save,
  "id" | "files" | "width" | "height" | "dominantColors" | "blurhash"
>;

export interface CompressionCandidate {
  save: CompressionSave;
  file: SaveFile;
  source: Buffer;
  thumbnail: { file: SaveFile; source: Buffer } | null;
}

export interface CompressionRuntime {
  load(
    ids: readonly string[],
    fileIndex: number,
    signal: AbortSignal,
  ): Promise<CompressionCandidate[]>;
  commit(transactions: Transaction[]): Promise<void>;
  recordUndo(transactions: Transaction[]): void;
}

export interface ImageCompressionResult {
  changed: number;
  skipped: number;
  bytesBefore: number;
  bytesAfter: number;
}

const runtime: CompressionRuntime = {
  async load(ids, fileIndex, signal) {
    const root = resolvePaths().libraryRoot;
    const db = await getDb();
    const rows = db
      .select()
      .from(saves)
      .where(inArray(saves.id, [...ids]))
      .all();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const limit = pLimit(4);
    const candidates = await Promise.all(
      ids.map((id) =>
        limit(async (): Promise<CompressionCandidate | null> => {
          signal.throwIfAborted();
          if (resolvePaths().libraryRoot !== root)
            throw new Error(
              "The active library changed. Start the compression again.",
            );
          const save = byId.get(id);
          const file = save?.files?.[fileIndex];
          if (!save || !file) return null;
          const thumbnail = save.files?.find(
            (entry) => entry.kind === THUMBNAIL_KIND,
          );
          const [source, thumbnailSource] = await Promise.all([
            readLibraryMedia(join(saveDirIn(root, id), file.path)),
            thumbnail
              ? readLibraryMedia(join(saveDirIn(root, id), thumbnail.path))
              : null,
          ]);
          return {
            save,
            file,
            source,
            thumbnail:
              thumbnail && thumbnailSource
                ? { file: thumbnail, source: thumbnailSource }
                : null,
          };
        }),
      ),
    );
    return candidates.filter((candidate) => candidate !== null);
  },
  async commit(transactions) {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
};

export async function compressExistingImages(
  input: ImageCompressionRequest & {
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
    assertActive?: () => void;
  },
  operations: CompressionRuntime = runtime,
): Promise<ImageCompressionResult> {
  const ids = [...new Set(input.ids)];
  const candidates = await operations.load(ids, input.fileIndex, input.signal);
  const transactions: Transaction[] = [];
  let bytesBefore = 0;
  let bytesAfter = 0;
  let skipped = ids.length - candidates.length;
  for (const [index, candidate] of candidates.entries()) {
    input.signal.throwIfAborted();
    input.assertActive?.();
    const compressed = await encodeCompressedImage(
      candidate.source,
      candidate.file.path,
      input.mode,
      input.quality,
    );
    if (
      !compressed ||
      (!["webp", "upscale", "remove-background"].includes(input.mode) &&
        compressed.length >= candidate.source.length)
    ) {
      skipped += 1;
      input.onProgress?.(index + 1, ids.length);
      continue;
    }
    const transaction = await compressionTransaction(
      candidate,
      compressed,
      input.mode,
    );
    transactions.push(transaction);
    bytesBefore += candidate.source.length;
    bytesAfter += compressed.length;
    input.onProgress?.(index + 1, ids.length);
  }
  input.signal.throwIfAborted();
  input.assertActive?.();
  if (transactions.length > 0) {
    await operations.commit(transactions);
    operations.recordUndo(transactions);
  }
  return {
    changed: transactions.length,
    skipped,
    bytesBefore,
    bytesAfter,
  };
}

export async function encodeCompressedImage(
  source: Buffer,
  path: string,
  mode: ImageCompressionRequest["mode"],
  quality: number,
): Promise<Buffer | null> {
  const extension = extname(path).slice(1).toLowerCase();
  if (mode === "upscale") {
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) return null;
    return sharp(source)
      .resize(metadata.width * 2, metadata.height * 2, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .toFormat(extension === "jpg" || extension === "jpeg" ? "jpeg" : "png", {
        quality,
      })
      .toBuffer();
  }
  if (mode === "remove-background") {
    const decoded = await sharp(source).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const pixels = decoded.data;
    const targetRed = pixels[0] ?? 255;
    const targetGreen = pixels[1] ?? 255;
    const targetBlue = pixels[2] ?? 255;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const distance = Math.hypot(
        (pixels[offset] ?? 0) - targetRed,
        (pixels[offset + 1] ?? 0) - targetGreen,
        (pixels[offset + 2] ?? 0) - targetBlue,
      );
      if (distance < 36) pixels[offset + 3] = 0;
      else if (distance < 72)
        pixels[offset + 3] = Math.round(((distance - 36) / 36) * 255);
    }
    return sharp(pixels, { raw: decoded.info })
      .webp({ lossless: true })
      .toBuffer();
  }
  if (mode === "webp") {
    return sharp(source, {
      animated: extension === "gif" || extension === "webp",
      failOn: "warning",
      limitInputPixels: 100_000_000,
    })
      .rotate()
      .webp({ quality, effort: 6 })
      .toBuffer();
  }
  if (extension === "svg") {
    if (mode !== "lossless") return null;
    return optimizeSvg(source);
  }
  const image = sharp(source, {
    animated: extension === "gif" || extension === "webp",
    failOn: "warning",
    limitInputPixels: 100_000_000,
  }).rotate();
  switch (extension) {
    case "jpg":
    case "jpeg":
    case "jpe":
    case "jfif":
      if (mode === "lossless") return null;
      return image.jpeg({ quality, mozjpeg: true }).toBuffer();
    case "png":
      return image
        .png(
          mode === "lossless"
            ? { compressionLevel: 9 }
            : {
                compressionLevel: 9,
                palette: true,
                quality,
              },
        )
        .toBuffer();
    case "webp":
      return image
        .webp({ quality, lossless: mode === "lossless", effort: 6 })
        .toBuffer();
    case "gif":
      if (!sharp.format.gif.output)
        throw new Error("Sharp cannot compress GIF files in this build.");
      return image
        .gif(
          mode === "lossless"
            ? { effort: 10, reuse: true }
            : {
                effort: 10,
                colours: Math.max(2, Math.round((quality / 100) * 254) + 2),
              },
        )
        .toBuffer();
    default:
      return null;
  }
}

async function compressionTransaction(
  candidate: CompressionCandidate,
  compressed: Buffer,
  mode: ImageCompressionRequest["mode"],
): Promise<Transaction> {
  const metadata = await sharp(compressed, {
    animated: candidate.file.path.toLowerCase().endsWith(".gif"),
  }).metadata();
  const outputPath =
    mode === "webp" || mode === "remove-background"
      ? `${candidate.file.path.replace(/\.[^.]+$/, "")}.webp`
      : candidate.file.path;
  if (
    outputPath !== candidate.file.path &&
    (candidate.save.files ?? []).some((file) => file.path === outputPath)
  ) {
    throw new Error(`A file named ${outputPath} already exists in this save.`);
  }
  const updatedFile: SaveFile = {
    ...candidate.file,
    path: outputPath,
    mimeType:
      mode === "webp" || mode === "remove-background"
        ? "image/webp"
        : candidate.file.mimeType,
    sha256: digest(compressed),
    size: compressed.length,
    width: metadata.width ?? candidate.file.width,
    height: metadata.pageHeight ?? metadata.height ?? candidate.file.height,
  };
  const files = (candidate.save.files ?? []).map((file) =>
    file.path === candidate.file.path ? updatedFile : file,
  );
  const writes: TxSaveFile[] = [{ filename: outputPath, bytes: compressed }];
  const beforeFiles: TxSaveFile[] = [
    { filename: candidate.file.path, bytes: candidate.source },
  ];
  let thumbnailBytes: Buffer | null = null;
  let thumbnailRename: { from: string; to: string } | null = null;
  const palettePending = extractPalette(compressed);
  if (candidate.thumbnail) {
    thumbnailBytes = await renderThumbnail(compressed);
    if (thumbnailBytes) {
      const previousPath = candidate.thumbnail.file.path;
      const thumbnailPath = webpThumbnailFilename(previousPath);
      const thumbnailMetadata = await sharp(thumbnailBytes).metadata();
      const updatedThumbnail: SaveFile = {
        ...candidate.thumbnail.file,
        path: thumbnailPath,
        sha256: digest(thumbnailBytes),
        size: thumbnailBytes.length,
        mimeType: "image/webp",
        width: thumbnailMetadata.width ?? null,
        height: thumbnailMetadata.height ?? null,
      };
      const thumbnailIndex = files.findIndex(
        (file) => file.path === previousPath,
      );
      if (thumbnailIndex >= 0) files[thumbnailIndex] = updatedThumbnail;
      writes.push({
        filename: thumbnailPath,
        bytes: thumbnailBytes,
      });
      beforeFiles.push({
        filename: previousPath,
        bytes: candidate.thumbnail.source,
      });
      if (thumbnailPath !== previousPath) {
        thumbnailRename = { from: previousPath, to: thumbnailPath };
      }
    }
  }
  const palette = await palettePending;
  const blurhash = thumbnailBytes
    ? await encodeBlurhash(thumbnailBytes)
    : await encodeBlurhash(compressed);
  const patch = {
    files,
    width: metadata.width ?? candidate.save.width,
    height: metadata.pageHeight ?? metadata.height ?? candidate.save.height,
    dominantColors:
      palette.length > 0 ? palette : candidate.save.dominantColors,
    blurhash: blurhash ?? candidate.save.blurhash,
  };
  return {
    kind: "update",
    model: "save",
    id: candidate.save.id,
    before: {
      files: candidate.save.files,
      width: candidate.save.width,
      height: candidate.save.height,
      dominantColors: candidate.save.dominantColors,
      blurhash: candidate.save.blurhash,
    },
    patch,
    fileRenames: renameList(
      outputPath === candidate.file.path
        ? []
        : [{ from: candidate.file.path, to: outputPath }],
      thumbnailRename,
    ),
    files: writes,
    beforeFiles,
    meta: {
      actor: "user",
      actorReason: ["upscale", "remove-background"].includes(mode)
        ? `image:${mode}`
        : "image:compress",
    },
  };
}

function renameList(
  imageRenames: { from: string; to: string }[],
  thumbnailRename: { from: string; to: string } | null,
): { from: string; to: string }[] | undefined {
  const renames = [
    ...imageRenames,
    ...(thumbnailRename ? [thumbnailRename] : []),
  ];
  return renames.length > 0 ? renames : undefined;
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function optimizeSvg(source: Buffer): Buffer {
  const optimized = source
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return Buffer.from(optimized);
}
