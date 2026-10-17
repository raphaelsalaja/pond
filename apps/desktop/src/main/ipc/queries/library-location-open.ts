import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, nativeImage, shell } from "electron";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import { createPondBundle } from "../../core/ensure-default-library";
import { verifyLibraryBackup } from "../../core/library-backup";
import { updateLibraryIdentity } from "../../core/library-identity";
import { relocateLibrary } from "../../core/library-ops";
import {
  listRecentLibraries,
  removeRecentLibrary,
  setRecentLibraryIcon,
} from "../../core/recent-libraries";
import { flushTagsDump } from "../../core/tags-bundle";
import { LibraryMetadataError, readLibraryId } from "../../lib/library-id";
import { readLibraryPointer } from "../../lib/library-pointer";
import { isSamePath } from "../../lib/path-identity";
import { libraryRoot as libraryRootDir } from "../../paths";
import { recentLibrariesFile } from "./library-location-paths";
import {
  relaunchSoon,
  resumeLibraryWork,
  suspendLibraryWork,
} from "./library-location-runtime";
import { type QueryHandlerMap, query, StringParam } from "./params";

const PathParams = z.object({ path: StringParam });

async function pickLibraryIcon() {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const options = {
    title: "Choose Library Logo",
    buttonLabel: "Choose",
    properties: ["openFile" as const],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "tiff", "bmp"],
      },
    ],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  const path = result.filePaths[0];
  if (result.canceled || !path) {
    return { ok: false as const, reason: "cancelled" as const };
  }
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    return { ok: false as const, reason: "invalid_image" as const };
  }
  return {
    ok: true as const,
    icon: image
      .resize({ width: 256, height: 256, quality: "best" })
      .toDataURL(),
  };
}

export const libraryLocationOpenQueries = {
  async "library.recent"() {
    return listRecentLibraries(recentLibrariesFile(), libraryRootDir());
  },

  async "library.identity.pickIcon"(): Promise<
    QueryResult<"library.identity.pickIcon">
  > {
    return pickLibraryIcon();
  },

  "library.recent.pickIcon": query(
    PathParams,
    async (params): Promise<QueryResult<"library.recent.pickIcon">> => {
      const result = await pickLibraryIcon();
      if (!result.ok) return result;
      const { icon } = result;
      updateLibraryIdentity(params.path, { icon });
      setRecentLibraryIcon(recentLibrariesFile(), params.path, icon);
      return { ok: true as const, icon };
    },
  ),

  "library.recent.removeIcon": query(PathParams, (params) => {
    updateLibraryIdentity(params.path, { icon: null });
    setRecentLibraryIcon(recentLibrariesFile(), params.path, null);
    return { ok: true as const };
  }),

  "library.recent.reveal": query(PathParams, (params) => {
    const path = resolve(params.path);
    if (!existsSync(path)) {
      return { ok: false as const, reason: "missing" as const };
    }
    shell.showItemInFolder(path);
    return { ok: true as const };
  }),

  "library.recent.remove": query(PathParams, (params) => {
    removeRecentLibrary(recentLibrariesFile(), params.path);
    return { ok: true as const };
  }),

  "library.createAt": query(
    z.object({ path: StringParam, name: StringParam }),
    async (params): Promise<QueryResult<"library.createAt">> => {
      try {
        await suspendLibraryWork();
        await flushTagsDump();
        const result = await createPondBundle(params.path, params.name);
        if (!result.ok) {
          await resumeLibraryWork();
        } else {
          await relaunchSoon();
        }
        return result;
      } catch (error) {
        await resumeLibraryWork();
        if (error instanceof LibraryMetadataError) {
          return { ok: false as const, error: error.message };
        }
        throw error;
      }
    },
  ),

  async "library.pickFolder"(): Promise<QueryResult<"library.pickFolder">> {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOpts = {
      title: "Choose Where to Save Your Pond",
      buttonLabel: "Select",
      defaultPath: join(app.getPath("home"), "Pond"),
      properties: ["openDirectory" as const, "createDirectory" as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    const path = result.filePaths[0];
    if (result.canceled || !path) {
      return { ok: false as const, reason: "cancelled" as const };
    }
    return { ok: true as const, path };
  },

  async "library.pickExisting"(): Promise<QueryResult<"library.pickExisting">> {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOpts = {
      title: "Open an Existing Pond",
      buttonLabel: "Open",
      properties: ["openFile" as const, "openDirectory" as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, reason: "cancelled" as const };
    }
    const dest = result.filePaths[0];
    if (!dest) return { ok: false as const, reason: "cancelled" as const };
    return { ok: true as const, path: dest };
  },

  "library.switchTo": query(
    PathParams,
    async (params): Promise<QueryResult<"library.switchTo">> => {
      const dest = params.path.trim();
      if (!dest) return { ok: false as const, reason: "no_path" as const };

      const pointer = readLibraryPointer() ?? "";
      const cached = libraryRootDir();

      if (
        isSamePath(dest, cached) &&
        (!pointer || isSamePath(pointer, cached))
      ) {
        return { ok: true as const, path: dest, mode: "adopt" as const };
      }
      try {
        await suspendLibraryWork();
        await flushTagsDump();
        readLibraryId(dest);
        if ((await verifyLibraryBackup(dest)).verifiedManifest) {
          throw new Error(
            "Use Restore Backup to open a copy of this snapshot.",
          );
        }
        const result = await relocateLibrary(dest, "adopt");
        await relaunchSoon();
        return { ok: true as const, ...result };
      } catch (err) {
        await resumeLibraryWork();
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Couldn't open that library.",
        };
      }
    },
  ),
} satisfies QueryHandlerMap;
