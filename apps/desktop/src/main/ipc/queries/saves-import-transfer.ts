import { dialog } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import { reviewImportDuplicates } from "../../core/duplicate-import";
import { importEaglePackage } from "../../core/eagle-package";
import { importFiles } from "../../core/import-files";
import { importPondPackage } from "../../core/pond-package";
import { rememberSaveDrag } from "../../core/save-drag-session";
import { runTransferJob } from "../../core/transfer-jobs";
import { copySaveSelectionToLibrary } from "../../core/transfer-operations";
import { libraryRoot } from "../../paths";
import { resolveSaveDragFiles } from "../helpers";
import { pickImportPaths } from "./import-picker";
import {
  FileIndexParam,
  type QueryHandlerMap,
  query,
  StringListParam,
  StringParam,
} from "./params";
import {
  renderSaveDragIcon,
  SAVE_DRAG_ICON_SCALE,
  saveDragFileIconSize,
} from "./save-drag-icon";

export const savesImportTransferQueries = {
  "saves.reviewImportDuplicates": query(
    z.object({ paths: StringListParam }),
    async ({ paths }) => ({
      candidates: await reviewImportDuplicates(paths),
    }),
  ),
  async "saves.importEaglePackage"(): Promise<
    QueryResult<"saves.importEaglePackage">
  > {
    const picked = await dialog.showOpenDialog({
      title: "Import Eagle Package",
      buttonLabel: "Import",
      properties: ["openDirectory", "openFile"],
    });
    if (picked.canceled || !picked.filePaths[0])
      return { ok: false, reason: "cancelled" };
    try {
      const source = picked.filePaths[0];
      return {
        ok: true,
        ...(await runTransferJob(
          {
            kind: "import_eagle_package",
            origin: libraryRoot(),
            source,
            destination: libraryRoot(),
          },
          () => importEaglePackage(source),
        )),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Eagle package import failed.",
      };
    }
  },

  "saves.copyToLibrary": query(
    z.object({ ids: StringListParam }),
    async ({ ids }): Promise<QueryResult<"saves.copyToLibrary">> => {
      const picked = await dialog.showOpenDialog({
        title: "Copy to Library",
        buttonLabel: "Copy",
        properties: ["openDirectory", "openFile"],
      });
      const target = picked.filePaths[0];
      if (picked.canceled || !target) return { ok: false, reason: "cancelled" };
      try {
        return {
          ok: true,
          ...(await runTransferJob(
            {
              kind: "copy_library",
              origin: libraryRoot(),
              destination: target,
              ids,
            },
            () => copySaveSelectionToLibrary(ids, target),
          )),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not copy Saves.",
        };
      }
    },
  ),

  "saves.importPackage": query(
    z.object({}),
    async (): Promise<QueryResult<"saves.importPackage">> => {
      const picked = await dialog.showOpenDialog({
        title: "Import Pond Package",
        buttonLabel: "Import",
        properties: ["openDirectory", "openFile"],
      });
      if (picked.canceled || !picked.filePaths[0]) {
        return { ok: false, reason: "cancelled" };
      }
      try {
        const source = picked.filePaths[0];
        return {
          ok: true,
          ...(await runTransferJob(
            {
              kind: "import_package",
              origin: libraryRoot(),
              source,
              destination: libraryRoot(),
            },
            () => importPondPackage(source),
          )),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Package import failed.",
        };
      }
    },
  ),

  "saves.pickImportPaths": query(
    z.object({ kind: z.enum(["files", "folders"]) }),
    (params) => pickImportPaths(params.kind),
  ),

  "saves.importFiles": query(
    z.object({
      paths: StringListParam,
      tags: StringListParam,
      folderIds: StringListParam,
      duplicatePolicy: z
        .enum(["use-existing", "keep-both"])
        .optional()
        .default("keep-both"),
      duplicateDecisions: z
        .record(z.string(), z.enum(["use-existing", "keep-both"]))
        .optional()
        .default({}),
    }),
    async (params) => {
      const paths = params.paths.filter(Boolean);
      if (paths.length === 0) return { ok: false, error: "no_files" };
      const candidates =
        params.duplicatePolicy === "use-existing" ||
        Object.values(params.duplicateDecisions).includes("use-existing")
          ? await reviewImportDuplicates(paths)
          : [];
      const useExisting = Object.fromEntries(
        candidates.flatMap((candidate) => {
          const choice =
            params.duplicateDecisions[candidate.path] ?? params.duplicatePolicy;
          return choice === "use-existing"
            ? [[candidate.path, candidate.existingId]]
            : [];
        }),
      );
      return importFiles({
        paths,
        tags: params.tags,
        folderIds: params.folderIds,
        useExisting,
      });
    },
  ),

  "saves.startDrag": query(
    z.object({
      id: StringParam,
      ids: StringListParam,
      fileIndex: FileIndexParam,
      fileIndexes: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
    }),
    async (params, event): Promise<QueryResult<"saves.startDrag">> => {
      const ids = [
        ...new Set(
          (params.ids.length > 0 ? params.ids : [params.id]).filter(Boolean),
        ),
      ];
      if (ids.length === 0 || !event)
        return { ok: false, error: "Choose Saves to drag." };
      const dragged = await resolveSaveDragFiles(
        ids.map((id) => ({
          id,
          fileIndex: params.fileIndexes?.[id] ?? params.fileIndex,
        })),
      );
      const files = dragged.map((file) => file.path);
      const first = files[0];
      if (!first)
        return { ok: false, error: "These Saves have no files to drag." };
      rememberSaveDrag(dragged);
      try {
        const { app, nativeImage } = await import("electron");
        const rendered = await renderSaveDragIcon(
          dragged.map((file) => file.preview),
          files.length,
        );
        let icon = rendered
          ? nativeImage.createFromBuffer(rendered, {
              scaleFactor: SAVE_DRAG_ICON_SCALE,
            })
          : nativeImage.createEmpty();
        /** macOS rejects `startDrag` with an empty icon, which is what a video file decodes to. */
        if (icon.isEmpty())
          icon = await app
            .getFileIcon(first, {
              size: saveDragFileIconSize(process.platform),
            })
            .catch(() => icon);
        if (icon.isEmpty())
          return { ok: false, error: "Pond couldn't draw a drag preview." };
        if (files.length === 1) event.sender.startDrag({ file: first, icon });
        else event.sender.startDrag({ file: first, files, icon });
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] startDrag failed", error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  ),
} satisfies QueryHandlerMap;
