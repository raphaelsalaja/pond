import { createHash } from "node:crypto";
import { saves } from "@pond/schema/db";
import type { ImageCrop, NewSave, SaveFile } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { canDestructivelyEditImage } from "@shared/file-format";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { OutputInfo } from "sharp";
import { getDb } from "../db";
import { saveFile } from "../paths";
import { executeTransaction } from "./executor";
import { readLibraryMedia } from "./storage/library-media-storage";
import { recordForUndo } from "./undo";

export interface ApplyImageTransformInput {
  id: string;
  fileIndex: number;
  rotate?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  crop?: ImageCrop | null;
}

function transformedFile(
  file: SaveFile,
  bytes: Buffer,
  info: OutputInfo,
): SaveFile {
  return {
    ...file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
    width: info.width,
    height: info.height,
  };
}

export async function transformImageBytes(
  source: Buffer,
  input: Omit<ApplyImageTransformInput, "id" | "fileIndex">,
): Promise<{ bytes: Buffer; info: OutputInfo }> {
  let pipeline = sharp(source, {
    animated: true,
    failOn: "error",
    limitInputPixels: 100_000_000,
  });
  const metadata = await pipeline.metadata();
  if (input.crop && metadata.width && metadata.height) {
    const left = Math.floor(metadata.width * input.crop.x);
    const top = Math.floor(metadata.height * input.crop.y);
    const width = Math.max(
      1,
      Math.min(
        metadata.width - left,
        Math.round(metadata.width * input.crop.w),
      ),
    );
    const height = Math.max(
      1,
      Math.min(
        metadata.height - top,
        Math.round(metadata.height * input.crop.h),
      ),
    );
    pipeline = pipeline.extract({ left, top, width, height });
  }
  if (input.rotate) {
    pipeline = pipeline.rotate(input.rotate);
  }
  if (input.flipX) {
    pipeline = pipeline.flop();
  }
  if (input.flipY) {
    pipeline = pipeline.flip();
  }
  const result = await pipeline.toBuffer({ resolveWithObject: true });
  return { bytes: result.data, info: result.info };
}

export async function applyImageTransformToFile(
  input: ApplyImageTransformInput,
): Promise<{ ok: true }> {
  const db = await getDb();
  const save = db.select().from(saves).where(eq(saves.id, input.id)).get();
  if (!save) {
    throw new Error("The Save no longer exists.");
  }
  const file = save.files[input.fileIndex];
  if (!file) {
    throw new Error("The image no longer exists.");
  }
  if (!canDestructivelyEditImage(file.path)) {
    throw new Error("This image format can't be edited in place.");
  }

  const source = await readLibraryMedia(saveFile(input.id, file.path));
  const { bytes, info } = await transformImageBytes(source, input);
  const files = [...save.files];
  files[input.fileIndex] = transformedFile(file, bytes, info);
  const transformed = files[input.fileIndex];
  if (!transformed) {
    throw new Error("The transformed image is unavailable.");
  }
  const isCover = input.fileIndex === save.coverIndex;
  const patch = {
    files,
    fileSize: files.reduce((sum, entry) => sum + (entry.size ?? 0), 0),
    width: isCover ? transformed.width : save.width,
    height: isCover ? transformed.height : save.height,
    rotate: 0,
    flipX: false,
    flipY: false,
    crop: null,
    phash: null,
    blurhash: null,
    dominantColors: [],
    embedding: null,
    embeddingModel: null,
    clipEmbedding: null,
    clipModel: null,
    aesthetic: [],
    aestheticModel: null,
  };
  const before: Partial<NewSave> = {
    files: save.files,
    fileSize: save.fileSize,
    width: save.width,
    height: save.height,
    rotate: save.rotate,
    flipX: save.flipX,
    flipY: save.flipY,
    crop: save.crop,
    phash: save.phash,
    blurhash: save.blurhash,
    dominantColors: save.dominantColors,
    embedding: save.embedding,
    embeddingModel: save.embeddingModel,
    clipEmbedding: save.clipEmbedding,
    clipModel: save.clipModel,
    aesthetic: save.aesthetic,
    aestheticModel: save.aestheticModel,
  };
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: input.id,
    before,
    patch,
    files: [{ filename: file.path, bytes }],
    beforeFiles: [{ filename: file.path, bytes: source }],
    meta: { actor: "user", actorReason: "inspect:apply-to-file" },
  };
  try {
    await executeTransaction(transaction);
    recordForUndo(transaction);
    return { ok: true };
  } finally {
    source.fill(0);
    bytes.fill(0);
  }
}
