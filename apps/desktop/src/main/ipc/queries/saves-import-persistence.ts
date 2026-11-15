import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { resolveAppearance, type Save, saves } from "@pond/schema/db";
import { isVideoFile } from "@shared/media-index";
import { POSTER_KIND } from "@shared/save-file-names";
import { eq } from "drizzle-orm";
import { app, BrowserWindow, dialog, nativeImage, nativeTheme } from "electron";
import log from "electron-log/main.js";
import mime from "mime-types";
import { z } from "zod";
import { isBlankDocumentKind } from "../../../shared/blank-documents";
import { CombineImagesOptionsSchema } from "../../../shared/combine-images-contracts";
import { classifyLibraryFile } from "../../../shared/file-format";
import type { QueryResult } from "../../../shared/query-contracts";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import {
  listInstalledBlankDocumentApps,
  writeBlankDocumentFile,
} from "../../core/blank-documents";
import { gifFramePng } from "../../core/gif-thumbnail";
import { createManualSave } from "../../core/manual-import";
import { persistSave } from "../../core/persist-save";
import { runEnsurePoster } from "../../core/pipeline/workers/ensure-poster";
import { getPrefs } from "../../core/prefs";
import {
  ensureSaveThumbnail,
  persistSaveThumbnail,
  renderThumbnail,
  THUMBNAIL_REPLACE_KINDS,
} from "../../core/save-thumbnail";
import { readLibraryMedia } from "../../core/storage/library-media-storage";
import { srtToVtt } from "../../core/subtitles";
import { getDb } from "../../db";
import { saveFile } from "../../paths";
import { resolvePondSavePath } from "../helpers";
import {
  NullableStringParam,
  type QueryHandlerMap,
  query,
  StringListParam,
  StringParam,
} from "./params";
import { readClipboardImage } from "./saves-import-clipboard";
import {
  CreateManualParamsSchema,
  normalizeManualSaveInput,
} from "./saves-import-input";

const LottieAnimationSchema = z
  .object({ layers: z.array(z.unknown()) })
  .passthrough();
const blankDocumentIconCache = new Map<string, Promise<string | null>>();
const run = promisify(execFile);

/** Video thumbnails come from the poster, so a reset refetches the poster before rendering. */
async function resetSaveThumbnail(id: string, save: Pick<Save, "files">) {
  const files = save.files ?? [];
  if (files.some((file) => file.kind === POSTER_KIND || isVideoFile(file))) {
    try {
      await runEnsurePoster(id, { force: true });
      return;
    } catch (error) {
      log.warn("[pond thumbnail] poster reset failed", id, error);
    }
  }
  await ensureSaveThumbnail(id, save, { force: true });
}

async function readBundleIcon(path: string) {
  try {
    const { stdout } = await run(
      "/usr/bin/plutil",
      [
        "-extract",
        "CFBundleIconFile",
        "raw",
        join(path, "Contents/Info.plist"),
      ],
      { timeout: 3000 },
    );
    const configured = basename(stdout.trim());
    if (!configured) return null;
    const filename = configured.endsWith(".icns")
      ? configured
      : `${configured}.icns`;
    const iconPath = join(path, "Contents/Resources", filename);
    const scratch = await mkdtemp(join(tmpdir(), "pond-app-icon-"));
    try {
      const pngPath = join(scratch, "icon.png");
      await run(
        "/usr/bin/sips",
        ["-s", "format", "png", iconPath, "--out", pngPath],
        { timeout: 5000 },
      );
      const icon = nativeImage.createFromBuffer(await readFile(pngPath));
      return icon.isEmpty() ? null : icon;
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  } catch {
    return null;
  }
}

async function loadBlankDocumentIcon(path: string): Promise<string | null> {
  try {
    const icon =
      (await readBundleIcon(path)) ??
      (await app.getFileIcon(path, { size: "normal" }));
    const sized = icon.isEmpty()
      ? icon
      : icon.resize({ width: 32, height: 32, quality: "best" });
    return sized.isEmpty() ? null : sized.toDataURL();
  } catch {
    return null;
  }
}

/** Menus refresh concurrently at launch; share the in-flight lookup so each app spawns plutil and sips once. */
function blankDocumentIcon(path: string): Promise<string | null> {
  const cached = blankDocumentIconCache.get(path);
  if (cached) return cached;
  const pending = loadBlankDocumentIcon(path);
  blankDocumentIconCache.set(path, pending);
  return pending;
}

async function listBlankDocuments() {
  const documents = listInstalledBlankDocumentApps();
  const iconEntries = await Promise.all(
    documents.map(async ({ kind, path }) => {
      const icon = await blankDocumentIcon(path);
      return icon ? ([kind, icon] as const) : null;
    }),
  );
  return {
    kinds: documents.map((document) => document.kind),
    icons: Object.fromEntries(iconEntries.filter((entry) => entry != null)),
  };
}

const SAVE_NOT_FOUND: OkFailure = { ok: false, error: "Save not found." };

export const savesImportPersistenceQueries = {
  "saves.setCustomThumbnail": query(
    z.object({ id: StringParam }),
    async (params): Promise<QueryResult<"saves.setCustomThumbnail">> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const options = {
        properties: ["openFile" as const],
        message: "Choose a thumbnail",
        filters: [
          {
            name: "Images",
            extensions: [
              "jpg",
              "jpeg",
              "png",
              "webp",
              "avif",
              "gif",
              "heic",
              "heif",
              "jxl",
              "tif",
              "tiff",
            ],
          },
        ],
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const path = result.filePaths[0];
      if (result.canceled || !path) return { ok: false, reason: "cancelled" };
      const format = classifyLibraryFile(path, mime.lookup(path) || null);
      if (format.mediaType !== "image") {
        return { ok: false, error: "not_an_image" };
      }
      const fileInfo = await stat(path).catch(() => null);
      if (!fileInfo?.isFile() || fileInfo.size === 0) {
        return { ok: false, error: "empty_file" };
      }
      const bytes = await renderThumbnail(await readFile(path));
      if (!bytes) return { ok: false, error: "not_an_image" };
      const updated = await persistSaveThumbnail(
        params.id,
        bytes,
        "user:set-thumbnail",
      );
      return updated ? { ok: true } : SAVE_NOT_FOUND;
    },
  ),

  "saves.setThumbnailFromClipboard": query(
    z.object({ id: StringParam }),
    async ({ id }): Promise<QueryResult<"saves.setThumbnailFromClipboard">> => {
      const image = await readClipboardImage();
      if (image.isEmpty()) return { ok: false, error: "clipboard_empty" };
      const bytes = await renderThumbnail(image.toPNG());
      if (!bytes) return { ok: false, error: "not_an_image" };
      const updated = await persistSaveThumbnail(
        id,
        bytes,
        "user:set-thumbnail-from-clipboard",
      );
      return updated ? { ok: true } : SAVE_NOT_FOUND;
    },
  ),

  "saves.setGifThumbnail": query(
    z.object({
      id: StringParam,
      src: StringParam,
      frameIndex: z.number().int().min(0),
    }),
    async (params): Promise<QueryResult<"saves.setGifThumbnail">> => {
      const resolved = resolvePondSavePath(params.src);
      if (
        !resolved ||
        resolved.saveId.toLowerCase() !== params.id.toLowerCase()
      ) {
        return { ok: false, error: "missing_file" };
      }
      const png = await gifFramePng(
        await readLibraryMedia(resolved.path),
        params.frameIndex,
      );
      const updated = await persistSaveThumbnail(
        params.id,
        png,
        "user:set-gif-thumbnail",
      );
      return updated ? { ok: true } : SAVE_NOT_FOUND;
    },
  ),

  "saves.setImageThumbnail": query(
    z.object({
      id: StringParam,
      src: StringParam,
    }),
    async (params): Promise<QueryResult<"saves.setImageThumbnail">> => {
      const resolved = resolvePondSavePath(params.src);
      if (
        !resolved ||
        resolved.saveId.toLowerCase() !== params.id.toLowerCase()
      ) {
        return { ok: false, error: "missing_file" };
      }
      const rendered = await renderThumbnail(
        await readLibraryMedia(resolved.path),
      );
      if (!rendered) return { ok: false, error: "not_an_image" };
      const updated = await persistSaveThumbnail(
        params.id,
        rendered,
        "user:set-image-thumbnail",
      );
      return updated ? { ok: true } : SAVE_NOT_FOUND;
    },
  ),

  "saves.loadSubtitles": query(
    z.object({ id: StringParam }),
    async (params): Promise<QueryResult<"saves.loadSubtitles">> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const options = {
        properties: ["openFile" as const],
        message: "Choose a subtitle file",
        filters: [{ name: "Subtitles", extensions: ["vtt", "srt"] }],
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const path = result.filePaths[0];
      if (result.canceled || !path) return { ok: false, reason: "cancelled" };
      const raw = await readFile(path, "utf8");
      const vtt = srtToVtt(raw);
      const updated = await persistSave(
        params.id,
        {},
        {
          actorReason: "user:load-subtitles",
          replaceFilesWithKind: "subtitle",
          newFiles: [
            {
              kind: "subtitle",
              filename: "subtitles.vtt",
              mimeType: "text/vtt",
              bytes: Buffer.from(vtt, "utf8"),
            },
          ],
        },
      );
      return updated ? { ok: true } : SAVE_NOT_FOUND;
    },
  ),

  "saves.replaceFile": query(
    z.object({ id: StringParam }),
    async (params): Promise<QueryResult<"saves.replaceFile">> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const options = {
        properties: ["openFile" as const],
        message: "Choose a replacement file",
      };
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const path = picked.filePaths[0];
      if (picked.canceled || !path) return { ok: false, reason: "cancelled" };
      const { replaceSaveFile } = await import("../../core/replace-file");
      return replaceSaveFile({ id: params.id, sourcePath: path });
    },
  ),

  "saves.exportDotLottie": query(
    z.object({ id: StringParam, fileIndex: z.number().int().nonnegative() }),
    async ({
      id,
      fileIndex,
    }): Promise<QueryResult<"saves.exportDotLottie">> => {
      const db = await getDb();
      const row = db.select().from(saves).where(eq(saves.id, id)).get();
      const file = row?.files[fileIndex];
      if (!row || !file || !/\.json$/i.test(file.path))
        return { ok: false, error: "Choose a Lottie JSON file." };
      const bytes = await readLibraryMedia(saveFile(id, file.path));
      let source: unknown;
      try {
        source = JSON.parse(bytes.toString("utf8"));
      } catch {
        return { ok: false, error: "This file does not contain valid JSON." };
      }
      const animation = LottieAnimationSchema.safeParse(source);
      if (!animation.success)
        return {
          ok: false,
          error: "This JSON file is not a Lottie animation.",
        };
      const defaultName = `${basename(
        row.title?.trim() || file.path,
        extname(row.title?.trim() || file.path),
      )}.lottie`;
      const picked = await dialog.showSaveDialog({
        title: "Export dotLottie",
        defaultPath: defaultName,
        filters: [{ name: "dotLottie", extensions: ["lottie"] }],
      });
      if (picked.canceled || !picked.filePath)
        return { ok: false, reason: "cancelled" };
      const { default: JSZip } = await import("jszip");
      const archive = new JSZip();
      archive.file(
        "manifest.json",
        JSON.stringify({
          version: "1.0",
          generator: "Pond",
          animations: [{ id: "animation", loop: true, speed: 1 }],
        }),
      );
      archive.file("animations/animation.json", JSON.stringify(animation.data));
      await writeFile(
        picked.filePath,
        await archive.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        }),
      );
      return { ok: true };
    },
  ),

  "saves.removeCustomThumbnail": query(
    z.object({ id: StringParam }),
    async (params): Promise<QueryResult<"saves.removeCustomThumbnail">> => {
      const updated = await persistSave(
        params.id,
        {},
        {
          actorReason: "user:remove-thumbnail",
          replaceFilesWithKind: THUMBNAIL_REPLACE_KINDS,
        },
      );
      if (!updated) return SAVE_NOT_FOUND;
      await resetSaveThumbnail(params.id, updated);
      return { ok: true };
    },
  ),

  "saves.createManual": query(
    CreateManualParamsSchema,
    async (params): Promise<QueryResult<"saves.createManual">> =>
      createManualSave({
        ...normalizeManualSaveInput(params),
        inboxChannel: "captures",
      }),
  ),

  "saves.listBlankDocuments": query(z.object({}), listBlankDocuments),

  "saves.createBlankDocument": query(
    z.object({
      kind: z.string(),
      folderId: NullableStringParam,
    }),
    async (params): Promise<QueryResult<"saves.createBlankDocument">> => {
      if (!isBlankDocumentKind(params.kind))
        return { ok: false, error: "Choose a document type." };
      const path = await writeBlankDocumentFile(params.kind);
      if (!path)
        return { ok: false, error: "The document app is not installed." };
      const created = await createManualSave({
        title: null,
        filePaths: [path],
      });
      if (!created.ok) return created;
      if (params.folderId) {
        const { addSavesToFolder } = await import("../../core/folders");
        await addSavesToFolder(params.folderId, [created.id]);
      }
      return { ok: true, id: created.id };
    },
  ),

  "saves.combineImages": query(
    z.object({
      ids: StringListParam,
      folderId: NullableStringParam,
      options: CombineImagesOptionsSchema.partial().optional(),
    }),
    async (params): Promise<QueryResult<"saves.combineImages">> => {
      const { combineImages } = await import("../../core/combine-images");
      const options = CombineImagesOptionsSchema.parse(params.options ?? {});
      if (options.output === "export" && !options.outputPath) {
        const extension = options.format === "jpeg" ? "jpg" : options.format;
        const owner = BrowserWindow.getFocusedWindow();
        const saveOptions = {
          title: "Export Combined Image",
          defaultPath: `Combined Images.${extension}`,
          filters: [
            {
              name: options.format.toUpperCase(),
              extensions: [extension],
            },
          ],
        };
        const picked = owner
          ? await dialog.showSaveDialog(owner, saveOptions)
          : await dialog.showSaveDialog(saveOptions);
        if (picked.canceled || !picked.filePath)
          return { ok: false, reason: "cancelled" };
        options.outputPath = picked.filePath;
      }
      const prefs = await getPrefs();
      return combineImages({
        ids: params.ids,
        folderId: params.folderId || null,
        options,
        cover: {
          tweetCover: prefs.preferences.tweetCover,
          theme: resolveAppearance(prefs, nativeTheme.shouldUseDarkColors),
        },
      });
    },
  ),
} satisfies QueryHandlerMap;
