import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import {
  type CombineImageCover,
  pickCombineImageFile,
} from "@shared/combine-image-file";
import {
  type CombineImagesOptions,
  CombineImagesOptionsSchema,
} from "@shared/combine-images-contracts";
import { layoutCombinedImages } from "@shared/combine-images-layout";
import type { OkResult } from "@shared/query-contracts-shared";
import { inArray } from "drizzle-orm";
import pLimit from "p-limit";
import sharp, { type OverlayOptions } from "sharp";
import { getDb } from "../db";
import { resolveSaveFilePath } from "../ipc/helpers";
import { executeBatch } from "./executor";
import { addSavesToFolder } from "./folders";
import { createManualSave } from "./manual-import";
import { readLibraryMedia } from "./storage/library-media-storage";
import { recordBatchForUndo } from "./undo";

export async function joinRasterImages(
  paths: Array<string | Buffer>,
  input: Partial<CombineImagesOptions> = {},
): Promise<Buffer> {
  if (paths.length < 2) throw new Error("Select at least two images.");
  const options = CombineImagesOptionsSchema.parse(input);
  const ordered = options.order === "reverse" ? [...paths].reverse() : paths;
  const sources = await Promise.all(
    ordered.map(async (path) => {
      const image = sharp(path, { pages: 1 }).rotate();
      const meta = await image.metadata();
      return { input: path, width: meta.width ?? 1, height: meta.height ?? 1 };
    }),
  );
  const layout = layoutCombinedImages(sources, options);
  const composites: OverlayOptions[] = await Promise.all(
    sources.map(async (source, index) => {
      const { left, top, width, height } = layout.items[index] ?? {
        left: 0,
        top: 0,
        width: source.width,
        height: source.height,
      };
      let image = sharp(source.input, { pages: 1 })
        .rotate()
        .resize({ width, height, fit: "fill" })
        .ensureAlpha()
        .png();
      if (options.radius > 0 || options.opacity < 1) {
        const radius = Math.min(options.radius, width / 2, height / 2);
        const mask = Buffer.from(
          `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white" fill-opacity="${options.opacity}"/></svg>`,
        );
        image = image.composite([{ input: mask, blend: "dest-in" }]);
      }
      return { input: await image.toBuffer(), left, top };
    }),
  );
  let output = sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: options.background,
    },
  }).composite(composites);
  if (options.canvasRadius > 0 && options.format !== "jpeg") {
    const radius = Math.min(
      options.canvasRadius,
      layout.width / 2,
      layout.height / 2,
    );
    const mask = Buffer.from(
      `<svg width="${layout.width}" height="${layout.height}"><rect width="${layout.width}" height="${layout.height}" rx="${radius}" fill="white"/></svg>`,
    );
    output = sharp(await output.png().toBuffer()).composite([
      { input: mask, blend: "dest-in" },
    ]);
  }
  switch (options.format) {
    case "jpeg":
      return output
        .flatten({ background: options.background })
        .jpeg({ quality: options.quality, mozjpeg: true })
        .toBuffer();
    case "webp":
      return output
        .webp({ quality: options.quality, lossless: options.lossless })
        .toBuffer();
    case "png":
      return output.png({ compressionLevel: 9 }).toBuffer();
  }
}

export async function combineImages(input: {
  ids: string[];
  folderId?: string | null;
  options?: Partial<CombineImagesOptions>;
  cover?: CombineImageCover;
}): Promise<OkResult<{ id?: string; path?: string; skipped: number }>> {
  const unique = [...new Set(input.ids.filter(Boolean))];
  if (unique.length < 2) {
    return {
      ok: false,
      error: "Select at least two images.",
    };
  }
  const db = await getDb();
  const rows = db.select().from(saves).where(inArray(saves.id, unique)).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const limit = pLimit(4);
  const loaded = await Promise.all(
    unique.map((id) =>
      limit(async () => {
        const row = byId.get(id);
        const files = row?.files ?? [];
        const file = pickCombineImageFile(files, input.cover);
        const fileIndex = file ? files.indexOf(file) : -1;
        if (!row || fileIndex < 0) return null;
        const target = await resolveSaveFilePath(id, fileIndex);
        if (!target.ok) return null;
        return { id, bytes: await readLibraryMedia(target.path) };
      }),
    ),
  );
  const combinable = loaded.filter((entry) => entry !== null);
  const imageInputs: Array<string | Buffer> = combinable.map(
    (entry) => entry.bytes,
  );
  const combinedIds = combinable.map((entry) => entry.id);
  const skipped = unique.length - combinable.length;
  if (imageInputs.length < 2) {
    return { ok: false, error: "Select at least two images." };
  }
  const directory = await mkdtemp(join(tmpdir(), "pond-combine-"));
  try {
    const options = CombineImagesOptionsSchema.parse(input.options ?? {});
    if (options.output === "export" && !options.outputPath)
      return { ok: false, error: "Choose an export location." };
    const bytes = await joinRasterImages(imageInputs, options);
    const extension = options.format === "jpeg" ? "jpg" : options.format;
    const path =
      options.output === "export"
        ? (options.outputPath ?? "")
        : join(directory, `combined.${extension}`);
    await writeFile(path, bytes);
    if (options.output === "export") {
      await trashCombinedOriginals(combinedIds, options.deleteOriginals);
      return { ok: true, path, skipped };
    }
    const created = await createManualSave({
      title: "Combined Images",
      filePaths: [path],
    });
    if (!created.ok) return created;
    if (input.folderId) {
      await addSavesToFolder(input.folderId, [created.id]);
    }
    await trashCombinedOriginals(combinedIds, options.deleteOriginals);
    return { ok: true, id: created.id, skipped };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function trashCombinedOriginals(
  ids: string[],
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  const transactions: Transaction[] = ids.map((id) => ({
    kind: "trash",
    model: "save",
    id,
    meta: { actor: "user", actorReason: "combine-images-delete-originals" },
  }));
  await executeBatch(transactions);
  recordBatchForUndo(transactions);
}
