import { app, BrowserWindow, dialog, shell } from "electron";
import log from "electron-log/main.js";
import {
  emptyTrashOlderThan,
  exportLibraryJson,
  exportLibraryZip,
  previewRelocate,
  purgeLibrarySubdir,
  type RelocateMode,
  relocateLibrary,
  verifyLibraryIntegrity,
} from "../../core/library-ops";
import { setPrefs } from "../../core/prefs";
import { reconcileLibrary } from "../../core/scan";
import { libraryRoot as libraryRootDir } from "../../paths";
import type { QueryHandlerMap } from "../helpers";

export const libraryQueries: QueryHandlerMap = {
  async "library.rescan"() {
    return await reconcileLibrary();
  },

  async "library.openInFinder"() {
    const root = libraryRootDir();
    const err = await shell.openPath(root);
    if (err) return { ok: false as const, reason: err };
    return { ok: true as const };
  },

  async "library.verifyIntegrity"() {
    try {
      const result = await verifyLibraryIntegrity();
      return { ok: true as const, ...result };
    } catch (err) {
      log.warn("[pond ipc] verifyIntegrity failed", err);
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "internal_error",
      };
    }
  },

  // Open the OS folder picker. Returns the chosen absolute path so
  // the renderer can hand it back to `library.previewRelocate` and
  // show a confirm dialog. We keep "pick" and "preview" separate so
  // the renderer is free to call preview against a hard-coded path
  // too (used during onboarding tests).
  async "library.pickFolder"() {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOpts = {
      title: "Pick a folder for your Pond library",
      properties: ["openDirectory" as const, "createDirectory" as const],
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

  async "library.previewRelocate"(params) {
    const candidate = String(params.path ?? "").trim();
    if (!candidate) {
      return { ok: false as const, reason: "no_path" as const };
    }
    try {
      const preview = previewRelocate(candidate);
      return { ok: true as const, preview };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "preview_failed",
      };
    }
  },

  async "library.relocate"(params) {
    const dest = String(params.path ?? "").trim();
    const mode = (params.mode === "adopt" ? "adopt" : "copy") as RelocateMode;
    const restart = params.restart !== false;
    if (!dest) {
      return { ok: false as const, reason: "no_path" as const };
    }
    try {
      const result = await relocateLibrary(dest, mode);
      if (restart) {
        // Defer so the IPC response can land before we tear down the
        // process. The renderer's `await` resolves with the success
        // payload, then the app vanishes and comes back pointing at
        // the new library.
        setTimeout(() => {
          log.info("[pond library-ops] relaunching after relocate");
          app.relaunch();
          app.exit(0);
        }, 150);
      }
      return { ok: true as const, ...result };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "relocate_failed",
      };
    }
  },

  // Back-compat: old "Move Library…" calls funnel through here. New
  // UI uses pickFolder + previewRelocate + relocate.
  async "library.move"(params) {
    const explicitDest =
      typeof params.path === "string" ? params.path.trim() : "";
    let dest = explicitDest;
    if (!dest) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const dialogOpts = {
        title: "Pick a folder for your Pond library",
        properties: ["openDirectory" as const, "createDirectory" as const],
      };
      const result = win
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts);
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, reason: "cancelled" as const };
      }
      const picked = result.filePaths[0];
      if (!picked) return { ok: false as const, reason: "cancelled" as const };
      dest = picked;
    }
    try {
      const result = await relocateLibrary(dest, "copy");
      return { ok: true as const, path: result.path };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "move_failed",
      };
    }
  },

  async "library.exportZip"() {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOpts = {
      title: "Save library export",
      defaultPath: `pond-library-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Zip", extensions: ["zip"] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);
    if (result.canceled || !result.filePath) {
      return { ok: false as const, reason: "cancelled" as const };
    }
    try {
      const path = await exportLibraryZip(result.filePath);
      return { ok: true as const, path };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "export_failed",
      };
    }
  },

  async "library.exportJson"() {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const dialogOpts = {
      title: "Pick a folder for the JSON export",
      properties: ["openDirectory" as const, "createDirectory" as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, reason: "cancelled" as const };
    }
    const dest = result.filePaths[0];
    if (!dest) return { ok: false as const, reason: "cancelled" as const };
    try {
      const out = await exportLibraryJson(dest);
      return { ok: true as const, path: out };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "export_failed",
      };
    }
  },

  async "trash.emptyOlderThan"(params) {
    const days = Math.max(0, Number(params.days ?? 0));
    const purged = await emptyTrashOlderThan(days);
    return { ok: true as const, purged };
  },

  async "reset.preferences"() {
    const { DEFAULT_PREFS } = await import("@pond/schema/db");
    await setPrefs(DEFAULT_PREFS);
    return { ok: true as const };
  },

  async "reset.clearVideoCache"() {
    const removed = await purgeLibrarySubdir("_video_cache");
    return { ok: true as const, removed };
  },

  async "reset.clearThumbnails"() {
    const removed = await purgeLibrarySubdir("_thumbs");
    return { ok: true as const, removed };
  },

  async "reset.factory"() {
    const dbPath = (await import("../../paths")).resolvePaths().indexDb;
    try {
      const { rm } = await import("node:fs/promises");
      await rm(dbPath, { force: true });
    } catch (err) {
      log.warn("[pond reset] db removal failed", err);
    }
    return { ok: true as const };
  },

  async "storage.snapshot"() {
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

  async "storage.guardState"() {
    const { getStorageGuardState } = await import("../../core/storage-watcher");
    return getStorageGuardState();
  },

  async "backups.snapshotNow"() {
    const { snapshotNow } = await import("../../core/backups");
    const snap = await snapshotNow();
    return { ok: true as const, snapshot: snap };
  },

  async "backups.list"() {
    const { listSnapshots } = await import("../../core/backups");
    return { ok: true as const, snapshots: await listSnapshots() };
  },

  async "backups.reveal"(params) {
    const { listSnapshots } = await import("../../core/backups");
    const list = await listSnapshots();
    const target = list.find((s) => s.filename === String(params.filename));
    if (!target) return { ok: false as const, reason: "not_found" as const };
    shell.showItemInFolder(target.path);
    return { ok: true as const };
  },

  async "backups.delete"(params) {
    const { listSnapshots } = await import("../../core/backups");
    const list = await listSnapshots();
    const target = list.find((s) => s.filename === String(params.filename));
    if (!target) return { ok: false as const, reason: "not_found" as const };
    const { rm } = await import("node:fs/promises");
    await rm(target.path, { force: true });
    return { ok: true as const };
  },

  async "api.restart"() {
    try {
      const { restartHttpServer } = await import("../../index");
      const result = await restartHttpServer();
      return { ok: true as const, ...result };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "internal_error",
      };
    }
  },

  async "updates.applyPrefs"() {
    try {
      const { applyUpdaterPrefs } = await import("../../updater");
      await applyUpdaterPrefs();
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "internal_error",
      };
    }
  },

  async "updates.checkNow"() {
    const { checkForUpdatesNow } = await import("../../updater");
    return await checkForUpdatesNow();
  },

  async "quickCapture.applyPrefs"() {
    try {
      const { applyPrefsAtRuntime } = await import("../../index");
      await applyPrefsAtRuntime();
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] applyPrefsAtRuntime failed", err);
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : "internal_error",
      };
    }
  },
};
