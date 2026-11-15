import { app, BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { userError } from "../../../shared/user-error";
import { startAutoImport, stopAutoImport } from "../../core/auto-import";
import { closeCombineImagesWindow } from "../../core/combine-images-window";
import { resumeMutations, suspendMutations } from "../../core/executor";
import { closeFileRingOverlay } from "../../core/file-ring-overlay";
import {
  resumeLibraryTransfers,
  stopLibraryTransfers,
} from "../../core/library-transfers";
import { downloadActivity } from "../../core/pipeline/download-activity";
import { createLibraryWorkCoordinator } from "../../core/pipeline/library-work-coordinator";
import {
  pauseAndDrainReconciler,
  setReconcilerPaused,
} from "../../core/pipeline/reconciler-client";
import { invalidatePrefs } from "../../core/prefs";
import { closePreviewWindows } from "../../core/preview-windows";
import { reconcileLibrary } from "../../core/scan";
import { flushTagsDump, hydrateTagsFromBundle } from "../../core/tags-bundle";
import { clearUndoHistory } from "../../core/undo";
import { closeDb } from "../../db";
import { rotateBundleBackups } from "../../lib/library-config";
import { relaunchApp } from "../../lib/relaunch-app";
import { invalidatePaths, resolvePaths } from "../../paths";

const libraryWork = createLibraryWorkCoordinator({
  stopAutoImport,
  stopLibraryTransfers,
  pauseAndDrainReconciler,
  suspendMutations,
  resumeMutations,
  resumeLibraryTransfers,
  setReconcilerPaused,
  startAutoImport,
  warn: (message, error) => log.warn(message, error),
});

export async function suspendLibraryWork(): Promise<void> {
  await libraryWork.suspend();
}

export async function resumeLibraryWork(): Promise<void> {
  await libraryWork.resume();
}

let relaunchPending = false;
let locationChange: Promise<void> = Promise.resolve();

export async function serializeLocationChange<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const next = locationChange.then(() => {
    if (relaunchPending) {
      throw userError("The library is reopening. Try again when it opens.");
    }
    return operation();
  });
  locationChange = next.then(
    () => {},
    () => {},
  );
  return next;
}

export function waitForLibraryLocationChanges(): Promise<void> {
  return locationChange;
}

export async function relaunchSoon(): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await softRepointInDev();
    return;
  }
  relaunchPending = true;
  setTimeout(() => {
    log.info("[pond library-ops] relaunching into new library");
    relaunchApp();
    app.quit();
  }, 150);
}

async function softRepointInDev(): Promise<void> {
  log.info("[pond library-ops] dev re-point into new library (no relaunch)");
  await flushTagsDump().catch((err) =>
    log.warn("[pond library-ops] tags.json flush failed", err),
  );
  downloadActivity.reset();
  closeDb();
  invalidatePaths();
  invalidatePrefs();
  clearUndoHistory();
  resumeMutations();
  try {
    const paths = resolvePaths();
    rotateBundleBackups(paths.backupDir, [
      paths.libraryMetadata,
      paths.settingsFile,
      paths.tagsFile,
    ]);
  } catch (err) {
    log.warn("[pond library-ops] bundle backup rotation failed", err);
  }
  try {
    await hydrateTagsFromBundle();
  } catch (err) {
    log.warn("[pond library-ops] tags.json hydrate failed", err);
  }
  try {
    await reconcileLibrary();
  } catch (err) {
    log.warn("[pond library-ops] dev re-point reconcile failed", err);
  }
  await resumeLibraryWork();
  closePreviewWindows();
  closeCombineImagesWindow();
  closeFileRingOverlay();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.reload();
  }
}
