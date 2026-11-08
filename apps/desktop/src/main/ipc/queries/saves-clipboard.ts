import { resolve, sep } from "node:path";
import { saves } from "@pond/schema/db";
import { isThumbnailKind } from "@shared/save-file-names";
import { eq } from "drizzle-orm";
import { ClipboardItem, clipboard, nativeImage } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import { readLibraryMedia } from "../../core/storage/library-media-storage";
import { getDb } from "../../db";
import { writeFileRefsToClipboard } from "../../lib/clipboard-files";
import { saveDir } from "../../paths";
import { resolveSaveFilePath } from "../helpers";
import {
  FileIndexParam,
  type QueryHandlerMap,
  query,
  StringParam,
} from "./params";

const FileParams = z.object({ id: StringParam, fileIndex: FileIndexParam });

export const savesClipboardQueries = {
  "saves.copyImage": query(
    FileParams,
    async (params): Promise<QueryResult<"saves.copyImage">> => {
      if (!params.id) return { ok: false, reason: "not_found" };
      const target = await resolveSaveFilePath(params.id, params.fileIndex);
      if (!target.ok) return target;
      try {
        const image = nativeImage.createFromBuffer(
          await readLibraryMedia(target.path),
        );
        if (image.isEmpty()) return { ok: false, reason: "missing" };
        await clipboard.write([
          new ClipboardItem({
            "image/png": new Blob([Uint8Array.from(image.toPNG())], {
              type: "image/png",
            }),
          }),
        ]);
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] saves.copyImage failed", error);
        return { ok: false, reason: "internal_error" };
      }
    },
  ),

  "saves.copyThumbnail": query(
    z.object({ id: StringParam }),
    async ({ id }): Promise<QueryResult<"saves.copyThumbnail">> => {
      if (!id) return { ok: false, reason: "not_found" };
      const db = await getDb();
      const row = db.select().from(saves).where(eq(saves.id, id)).get();
      const file = row?.files.find((candidate) =>
        isThumbnailKind(candidate.kind),
      );
      if (!file) return { ok: false, reason: "missing" };
      const root = resolve(saveDir(id));
      const path = resolve(root, file.path);
      if (!path.startsWith(`${root}${sep}`))
        return { ok: false, reason: "unsafe_path" };
      try {
        const image = nativeImage.createFromBuffer(
          await readLibraryMedia(path),
        );
        if (image.isEmpty()) return { ok: false, reason: "missing" };
        await clipboard.write([
          new ClipboardItem({
            "image/png": new Blob([Uint8Array.from(image.toPNG())], {
              type: "image/png",
            }),
          }),
        ]);
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] saves.copyThumbnail failed", error);
        return { ok: false, reason: "internal_error" };
      }
    },
  ),

  "saves.copyBase64": query(
    FileParams,
    async (params): Promise<QueryResult<"saves.copyBase64">> => {
      if (!params.id) return { ok: false, reason: "not_found" };
      const target = await resolveSaveFilePath(params.id, params.fileIndex);
      if (!target.ok) return target;
      try {
        await clipboard.writeText(
          (await readLibraryMedia(target.path)).toString("base64"),
        );
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] saves.copyBase64 failed", error);
        return { ok: false, reason: "internal_error" };
      }
    },
  ),

  "saves.copyFile": query(
    FileParams,
    async (params): Promise<QueryResult<"saves.copyFile">> => {
      if (!params.id) return { ok: false, reason: "not_found" };
      const target = await resolveSaveFilePath(params.id, params.fileIndex);
      if (!target.ok) return target;
      try {
        await writeFileRefsToClipboard([target.path]);
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] saves.copyFile failed", error);
        return { ok: false, reason: "internal_error" };
      }
    },
  ),

  "saves.copyFiles": query(
    z.object({
      files: z.array(FileParams.catch({ id: "", fileIndex: 0 })).catch([]),
    }),
    async (params): Promise<QueryResult<"saves.copyFiles">> => {
      if (params.files.length === 0) return { ok: false, reason: "not_found" };
      const paths: string[] = [];
      for (const entry of params.files) {
        if (!entry.id) continue;
        const target = await resolveSaveFilePath(entry.id, entry.fileIndex);
        if (target.ok) paths.push(target.path);
      }
      if (paths.length === 0) return { ok: false, reason: "missing" };
      try {
        await writeFileRefsToClipboard(paths);
        return { ok: true, copied: paths.length };
      } catch (error) {
        log.warn("[pond ipc] saves.copyFiles failed", error);
        return { ok: false, reason: "internal_error" };
      }
    },
  ),

  /** Renderer clipboard access can fail after a closing menu steals focus. */
  "clipboard.writeText": query(
    z.object({ text: StringParam }),
    async (params): Promise<QueryResult<"clipboard.writeText">> => {
      if (!params.text) return { ok: false, error: "Nothing to copy." };
      try {
        await clipboard.writeText(params.text);
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] clipboard.writeText failed", error);
        return { ok: false, error: "Couldn't copy to the clipboard." };
      }
    },
  ),
} satisfies QueryHandlerMap;
