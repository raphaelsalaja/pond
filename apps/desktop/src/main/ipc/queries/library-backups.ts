import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { BrowserWindow, dialog } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import {
  createLibraryBackup,
  restoreLibraryBackup,
  verifyLibraryBackup,
} from "../../core/library-backup";
import { relocateLibrary } from "../../core/library-ops";
import { flushPortableMetadata } from "../../core/portable-metadata";
import { setPrefs } from "../../core/prefs";
import { flushTagsDump } from "../../core/tags-bundle";
import {
  isPathInside,
  isSamePath,
  normalizeLibraryPath,
} from "../../lib/path-identity";
import { libraryRoot as libraryRootDir } from "../../paths";
import { ensurePondSuffix } from "./library-location-paths";
import {
  relaunchSoon,
  resumeLibraryWork,
  suspendLibraryWork,
} from "./library-location-runtime";
import { type QueryHandlerMap, query } from "./params";

export const libraryBackupQueries = {
  "library.backupTo": query(
    z.object({ path: z.string().optional() }),
    async (params): Promise<QueryResult<"library.backupTo">> => {
      const src = normalizeLibraryPath(libraryRootDir());
      if (!src || !existsSync(src)) {
        return { ok: false as const, reason: "no_library" as const };
      }

      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const stamp = new Date().toISOString().slice(0, 10);
      const base = basename(src).replace(/\.pond$/i, "") || "Pond";
      const dialogOpts = {
        title: "Backup Library",
        nameFieldLabel: "Backup Name:",
        buttonLabel: "Backup",
        defaultPath: join(dirname(src), `${base} Backup ${stamp}.pond`),
        properties: ["createDirectory" as const],
      };
      const picked = params.path?.trim()
        ? { canceled: false, filePath: params.path.trim() }
        : win
          ? await dialog.showSaveDialog(win, dialogOpts)
          : await dialog.showSaveDialog(dialogOpts);
      if (picked.canceled || !picked.filePath) {
        return { ok: false as const, reason: "cancelled" as const };
      }

      const dest = ensurePondSuffix(picked.filePath);
      const destResolved = normalizeLibraryPath(dest);

      if (isSamePath(src, destResolved)) {
        return { ok: false as const, reason: "same_path" as const };
      }
      if (isPathInside(src, destResolved) || isPathInside(destResolved, src)) {
        return { ok: false as const, reason: "nested_path" as const };
      }
      try {
        await suspendLibraryWork();
        await flushTagsDump();
        await flushPortableMetadata();
        const { copied } = await createLibraryBackup({
          source: src,
          destination: destResolved,
        });

        await setPrefs({
          storage: {
            lastBackup: {
              path: destResolved,
              libraryRoot: src,
              completedAt: new Date().toISOString(),
            },
          },
        }).catch((error) => log.warn("Could not record backup history", error));
        return { ok: true as const, path: destResolved, copied };
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error
              ? err.message
              : "Couldn't back up the library.",
        };
      } finally {
        await resumeLibraryWork();
      }
    },
  ),

  "library.restoreBackup": query(
    z.object({
      source: z.string().optional(),
      destination: z.string().optional(),
    }),
    async (params): Promise<QueryResult<"library.restoreBackup">> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const options = {
        title: "Choose a Pond Backup",
        buttonLabel: "Choose Backup",
        properties: ["openFile" as const, "openDirectory" as const],
      };
      const picked = params.source?.trim()
        ? { canceled: false, filePaths: [params.source.trim()] }
        : win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);
      const source = picked.filePaths[0];
      if (picked.canceled || !source) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      try {
        await verifyLibraryBackup(source);
        const destinationOptions = {
          title: "Restore Backup",
          buttonLabel: "Restore",
          defaultPath: join(
            dirname(source),
            `${basename(source).replace(/\.pond$/i, "")} Restored.pond`,
          ),
          properties: ["createDirectory" as const],
        };
        const destination = params.destination?.trim()
          ? { canceled: false, filePath: params.destination.trim() }
          : win
            ? await dialog.showSaveDialog(win, destinationOptions)
            : await dialog.showSaveDialog(destinationOptions);
        if (destination.canceled || !destination.filePath) {
          return { ok: false as const, reason: "cancelled" as const };
        }
        await suspendLibraryWork();
        await flushTagsDump();
        const restored = await restoreLibraryBackup({
          source,
          destination: ensurePondSuffix(destination.filePath),
        });
        await relocateLibrary(restored.path, "adopt");
        await relaunchSoon();
        return { ok: true as const, ...restored };
      } catch (error) {
        await resumeLibraryWork();
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't restore the backup.",
        };
      }
    },
  ),
} satisfies QueryHandlerMap;
