import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dialog, session, shell } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { LibraryMarkSourceSchema } from "../../../shared/library-mark";
import type { QueryResult } from "../../../shared/query-contracts";
import {
  readLibraryIdentity,
  updateLibraryIdentity,
} from "../../core/library-identity";
import { purgeDirectory, verifyLibraryIntegrity } from "../../core/library-ops";
import { getPrefs, invalidatePrefs, setPrefs } from "../../core/prefs";
import { reconcileLibrary } from "../../core/scan";
import { VIDEO_CACHE_DIR } from "../../core/video-preview-proxy";
import { closeDb } from "../../db";
import { showDock } from "../../dock";
import { libraryRoot, thumbnailCacheRoot } from "../../paths";
import { runtimeControls } from "../../runtime";
import { type QueryHandlerMap, query } from "./params";

export const libraryMaintenanceQueries = {
  async "library.info"() {
    const path = libraryRoot();
    return { path, ...readLibraryIdentity(path) };
  },

  "library.identity.update": query(
    z.object({
      name: z.string().optional(),
      icon: z.string().nullable().optional(),
      mark: LibraryMarkSourceSchema.nullable().optional(),
      accent: z.string().nullable().optional(),
    }),
    (params) => {
      try {
        return {
          ok: true as const,
          ...updateLibraryIdentity(libraryRoot(), params),
        };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not customize the library.",
        };
      }
    },
  ),

  async "library.rescan"() {
    return await reconcileLibrary();
  },

  async "library.openInFinder"(): Promise<QueryResult<"library.openInFinder">> {
    const err = await shell.openPath(libraryRoot());
    if (err) return { ok: false as const, error: err };
    return { ok: true as const };
  },

  async "library.exportDebugReport"(): Promise<
    QueryResult<"library.exportDebugReport">
  > {
    const picked = await dialog.showSaveDialog({
      title: "Export Debug Report",
      defaultPath: `Pond Debug Report ${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
    if (picked.canceled || !picked.filePath)
      return { ok: false as const, reason: "cancelled" as const };
    const { createDebugReport } = await import("../../core/debug-report");
    await writeFile(picked.filePath, await createDebugReport());
    return { ok: true as const, path: picked.filePath };
  },

  async "library.verifyIntegrity"(): Promise<
    QueryResult<"library.verifyIntegrity">
  > {
    try {
      const result = await verifyLibraryIntegrity();
      return { ok: true as const, ...result };
    } catch (err) {
      log.warn("[pond ipc] verifyIntegrity failed", err);
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      };
    }
  },

  async "reset.preferences"() {
    const { DEFAULT_PREFS } = await import("@pond/schema/db");
    await setPrefs(DEFAULT_PREFS);
    return { ok: true as const };
  },

  async "reset.clearVideoCache"() {
    const removed = await purgeDirectory(join(libraryRoot(), VIDEO_CACHE_DIR));
    return { ok: true as const, removed };
  },

  async "reset.clearThumbnails"() {
    const removed = await purgeDirectory(thumbnailCacheRoot());
    return { ok: true as const, removed };
  },

  async "reset.factory"() {
    const dbPath = (await import("../../paths")).resolvePaths().indexDb;
    closeDb();
    try {
      const { rm } = await import("node:fs/promises");
      await rm(dbPath, { force: true });
    } catch (err) {
      log.warn("[pond reset] db removal failed", err);
    }
    return { ok: true as const };
  },

  async "storage.snapshot"(): Promise<QueryResult<"storage.snapshot">> {
    const { getStorageSnapshot } = await import("../../core/storage-stats");
    return await getStorageSnapshot();
  },

  async "storage.applyGuardPrefs"() {
    const { applyStorageWatcherPrefs } = await import(
      "../../core/storage-watcher"
    );
    await applyStorageWatcherPrefs();
    return { ok: true as const };
  },

  async "storage.guardState"(): Promise<QueryResult<"storage.guardState">> {
    const { getStorageGuardState } = await import("../../core/storage-watcher");
    return getStorageGuardState();
  },

  async "api.restart"(): Promise<QueryResult<"api.restart">> {
    try {
      const result = await runtimeControls.restartHttpServer();
      return { ok: true as const, ...result };
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      };
    }
  },

  async "quickCapture.applyPrefs"(): Promise<
    QueryResult<"quickCapture.applyPrefs">
  > {
    try {
      await runtimeControls.applyPrefsAtRuntime();
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] applyPrefsAtRuntime failed", err);
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      };
    }
  },

  async "window.applyPrefs"(): Promise<QueryResult<"window.applyPrefs">> {
    try {
      await runtimeControls.applyWindowPrefsAtRuntime();
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] applyWindowPrefsAtRuntime failed", err);
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      };
    }
  },

  async "system.applyPrefs"() {
    invalidatePrefs();
    const prefs = (await getPrefs()).system;
    await session.defaultSession.setProxy(
      prefs.proxyMode === "manual" && prefs.proxyUrl
        ? { mode: "fixed_servers", proxyRules: prefs.proxyUrl }
        : { mode: prefs.proxyMode === "direct" ? "direct" : "system" },
    );
    if (prefs.dockVisibility === "always") await showDock();
    return { ok: true as const, restartRequired: true };
  },
} satisfies QueryHandlerMap;
