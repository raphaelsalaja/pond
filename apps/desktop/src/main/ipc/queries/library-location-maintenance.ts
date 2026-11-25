import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { LibraryMarkSourceSchema } from "../../../shared/library-mark";
import type { QueryResult } from "../../../shared/query-contracts";
import { restoreLibraryBackup } from "../../core/library-backup";
import { updateLibraryIdentity } from "../../core/library-identity";
import {
  removeMovedLibrarySource,
  renameLibraryBundle,
  rollbackLibraryRename,
} from "../../core/library-lifecycle";
import { relocateLibrary } from "../../core/library-ops";
import { flushPortableMetadata } from "../../core/portable-metadata";
import {
  removeRecentLibrary,
  renameRecentLibrary,
} from "../../core/recent-libraries";
import { flushTagsDump } from "../../core/tags-bundle";
import { runTransferJob } from "../../core/transfer-jobs";
import { mergeLibraryFrom } from "../../core/transfer-operations";
import { closeDb } from "../../db";
import { libraryRoot as libraryRootDir } from "../../paths";
import {
  ensurePondSuffix,
  recentLibrariesFile,
} from "./library-location-paths";
import {
  reopenLibrary,
  resumeLibraryWork,
  suspendLibraryWork,
} from "./library-location-runtime";
import { query, StringParam } from "./params";
import type { QueryHandlerMap } from "./params";

const PathParams = z.object({ path: StringParam });

export const libraryLocationMaintenanceQueries = {
  "library.mergeFrom": query(
    z.object({ source: z.string().optional() }),
    async (params): Promise<QueryResult<"library.mergeFrom">> => {
      let source = params.source?.trim();
      if (!source) {
        const picked = await dialog.showOpenDialog({
          title: "Merge Library",
          buttonLabel: "Merge",
          properties: ["openDirectory", "openFile"],
        });
        source = picked.filePaths[0];
        if (picked.canceled || !source) {
          return { ok: false, reason: "cancelled" as const };
        }
      }
      try {
        return {
          ok: true,
          ...(await runTransferJob(
            {
              kind: "merge_library",
              origin: libraryRootDir(),
              destination: libraryRootDir(),
              source,
            },
            () => mergeLibraryFrom(source),
          )),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not merge library.",
        };
      }
    },
  ),

  "library.rename": query(
    z.object({
      name: StringParam,
      icon: z.string().nullable().optional(),
      mark: LibraryMarkSourceSchema.nullable().optional(),
      accent: z.string().nullable().optional(),
    }),
    async (params): Promise<QueryResult<"library.rename">> => {
      const source = libraryRootDir();
      try {
        await suspendLibraryWork();
        await flushTagsDump();
        await flushPortableMetadata();
        closeDb();
        const renamed = await renameLibraryBundle(source, params.name);
        try {
          updateLibraryIdentity(renamed.path, {
            icon: params.icon,
            mark: params.mark,
            accent: params.accent,
          });
          await relocateLibrary(renamed.path, "adopt");
          renameRecentLibrary(recentLibrariesFile(), source, renamed.path);
          await reopenLibrary();
          return { ok: true as const, path: renamed.path };
        } catch (error) {
          await rollbackLibraryRename(
            source,
            renamed.path,
            renamed.previousName,
          );
          await relocateLibrary(source, "adopt").catch((cause: unknown) =>
            log.error("Could not restore the library pointer", cause),
          );
          throw error;
        }
      } catch (error) {
        await resumeLibraryWork();
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not rename the library.",
        };
      }
    },
  ),

  "library.move": query(
    PathParams,
    async (params): Promise<QueryResult<"library.move">> => {
      const src = libraryRootDir().replace(/\/+$/, "");
      if (!src || !existsSync(src)) {
        return { ok: false as const, reason: "no_library" as const };
      }

      let dest = params.path.trim();
      if (!dest) {
        const win = BrowserWindow.getFocusedWindow() ?? undefined;
        const dialogOpts = {
          title: "Move Library",
          nameFieldLabel: "Pond Name:",
          buttonLabel: "Move",
          defaultPath: join(app.getPath("home"), "Pond", "My Pond.pond"),
          properties: ["createDirectory" as const],
        };
        const result = win
          ? await dialog.showSaveDialog(win, dialogOpts)
          : await dialog.showSaveDialog(dialogOpts);
        if (result.canceled || !result.filePath) {
          return { ok: false as const, reason: "cancelled" as const };
        }
        dest = result.filePath;
      }

      const destResolved = resolve(ensurePondSuffix(dest)).replace(/\/+$/, "");
      const srcResolved = resolve(src);

      if (srcResolved === destResolved) {
        return { ok: false as const, reason: "same_path" as const };
      }
      if (
        destResolved.startsWith(`${srcResolved}/`) ||
        srcResolved.startsWith(`${destResolved}/`)
      ) {
        return { ok: false as const, reason: "nested_path" as const };
      }

      try {
        if (existsSync(destResolved)) {
          const entries = await readdir(destResolved);
          if (entries.length > 0) {
            return {
              ok: false as const,
              reason: "destination_exists" as const,
            };
          }
        }

        await suspendLibraryWork();
        await flushTagsDump();
        await flushPortableMetadata();
        await restoreLibraryBackup({
          source: srcResolved,
          destination: destResolved,
        });
        const result = await relocateLibrary(destResolved, "adopt");
        const sourceRemoved = await removeMovedLibrarySource(
          srcResolved,
          destResolved,
        );
        removeRecentLibrary(recentLibrariesFile(), srcResolved);
        await reopenLibrary();
        const moved = {
          ok: true as const,
          path: result.path,
          sourceRemoved,
        };
        if (sourceRemoved) return moved;
        return { ...moved, cleanupPath: srcResolved };
      } catch (error) {
        await resumeLibraryWork();
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't move the library.",
        };
      }
    },
  ),
} satisfies QueryHandlerMap;
