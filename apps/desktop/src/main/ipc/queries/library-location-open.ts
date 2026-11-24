import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type NativeImage,
  nativeImage,
  shell,
} from "electron";
import { z } from "zod";
import { PondTintSchema } from "../../../shared/library-mark";
import {
  centeredFrame,
  cropRect,
  LOGO_SIZE,
  type LogoCrop,
  pixelCrop,
} from "../../../shared/logo-crop";
import type { QueryResult } from "../../../shared/query-contracts";
import { createPondBundle } from "../../core/ensure-default-library";
import { isLibraryBackup } from "../../core/library-backup";
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
  announceLibraryOpening,
  announceLibrarySwitch,
  librarySwitchTarget,
  reopenLibrary,
  resumeLibraryWork,
  suspendLibraryWork,
} from "./library-location-runtime";
import { type QueryHandlerMap, query, StringParam } from "./params";

const PathParams = z.object({ path: StringParam });
/** Caps the image sent to the renderer for cropping; the logo itself is only 256px. */
const CROP_SOURCE_SIZE = 1024;

const CropIconParams = z.object({
  src: z
    .string()
    .max(32_000_000)
    .refine((value) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)),
  crop: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    size: z.number().finite().positive(),
  }),
});

function switchError(error: unknown): string {
  return error instanceof Error ? error.message : "Couldn't open that library.";
}

function cropLogo(image: NativeImage, crop: LogoCrop): string {
  const rect = pixelCrop(image.getSize(), crop);
  return image
    .crop({ x: rect.x, y: rect.y, width: rect.size, height: rect.size })
    .resize({ width: LOGO_SIZE, height: LOGO_SIZE, quality: "best" })
    .toDataURL();
}

function cropSource(image: NativeImage): NativeImage {
  const { width, height } = image.getSize();
  const scale = CROP_SOURCE_SIZE / Math.max(width, height);
  if (scale >= 1) return image;
  return image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: "best",
  });
}

async function pickLibraryImage() {
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
  return { ok: true as const, image };
}

export const libraryLocationOpenQueries = {
  async "library.recent"() {
    return listRecentLibraries(recentLibrariesFile(), libraryRootDir());
  },

  async "library.identity.pickIcon"(): Promise<
    QueryResult<"library.identity.pickIcon">
  > {
    const result = await pickLibraryImage();
    if (!result.ok) return result;
    const source = cropSource(result.image);
    return {
      ok: true as const,
      image: { src: source.toDataURL(), ...source.getSize() },
    };
  },

  "library.identity.cropIcon": query(
    CropIconParams,
    (params): QueryResult<"library.identity.cropIcon"> => {
      const image = nativeImage.createFromDataURL(params.src);
      if (image.isEmpty()) {
        return { ok: false as const, reason: "invalid_image" as const };
      }
      return { ok: true as const, icon: cropLogo(image, params.crop) };
    },
  ),

  "library.identity.pondLogo": query(
    z.object({ tint: PondTintSchema }),
    async (params): Promise<QueryResult<"library.identity.pondLogo">> => {
      const { appIconFile } = await import("../../core/app-icon");
      const file = appIconFile(params.tint);
      if (!file) return { ok: false as const, reason: "missing" as const };
      const image = nativeImage.createFromPath(file);
      if (image.isEmpty()) {
        return { ok: false as const, reason: "invalid_image" as const };
      }
      return {
        ok: true as const,
        icon: image
          .resize({ width: LOGO_SIZE, height: LOGO_SIZE, quality: "best" })
          .toDataURL(),
      };
    },
  ),

  "library.recent.pickIcon": query(
    PathParams,
    async (params): Promise<QueryResult<"library.recent.pickIcon">> => {
      const result = await pickLibraryImage();
      if (!result.ok) return result;
      const size = result.image.getSize();
      const icon = cropLogo(result.image, cropRect(size, centeredFrame(size)));
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
      const library = { name: params.name, icon: null };
      announceLibraryOpening(library);
      let result: Awaited<ReturnType<typeof createPondBundle>>;
      try {
        await suspendLibraryWork("interrupt");
        await flushTagsDump();
        result = createPondBundle(params.path, params.name);
      } catch (error) {
        await resumeLibraryWork();
        announceLibrarySwitch({
          phase: "failed",
          library,
          error: switchError(error),
        });
        if (error instanceof LibraryMetadataError) {
          return { ok: false as const, error: error.message };
        }
        throw error;
      }
      if (!result.ok) {
        await resumeLibraryWork();
        announceLibrarySwitch({
          phase: "failed",
          library,
          error:
            "Pond can't create a library in that folder. Try a different one.",
        });
        return result;
      }
      await reopenLibrary();
      return result;
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
        readLibraryId(dest);
        if (await isLibraryBackup(dest)) {
          throw new Error(
            "Use Restore Backup to open a copy of this snapshot.",
          );
        }
      } catch (error) {
        return { ok: false as const, error: switchError(error) };
      }

      const library = await librarySwitchTarget(dest);
      announceLibraryOpening(library);
      let result: Awaited<ReturnType<typeof relocateLibrary>>;
      try {
        await suspendLibraryWork("interrupt");
        await flushTagsDump();
        result = await relocateLibrary(dest, "adopt");
      } catch (error) {
        await resumeLibraryWork();
        const message = switchError(error);
        announceLibrarySwitch({ phase: "failed", library, error: message });
        return { ok: false as const, error: message };
      }
      await reopenLibrary();
      return { ok: true as const, ...result };
    },
  ),
} satisfies QueryHandlerMap;
