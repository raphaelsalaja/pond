import { setTimeout as sleep } from "node:timers/promises";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import type {
  LibrarySwitchEvent,
  LibrarySwitchTarget,
} from "../../../shared/library-switch-contracts";
import { hasActiveMessages, stopAllMessages } from "../../core/agent/chat";
import { fishMcp } from "../../core/agent/fish-mcp/live";
import { startAutoImport, stopAutoImport } from "../../core/auto-import";
import { captures } from "../../core/captures";
import { closeCombineImagesWindow } from "../../core/combine-images-window";
import { resumeMutations, suspendMutations } from "../../core/executor";
import { closeFileRingOverlay } from "../../core/file-ring-overlay";
import { libraryHealthService } from "../../core/library-health";
import { readLibraryIdentity } from "../../core/library-identity";
import {
  libraryTransfersRunning,
  resumeLibraryTransfers,
  stopLibraryTransfers,
} from "../../core/library-transfers";
import { downloadActivity } from "../../core/pipeline/download-activity";
import { createLibraryWorkCoordinator } from "../../core/pipeline/library-work-coordinator";
import type { LibraryWorkSuspension } from "../../core/pipeline/library-work-coordinator";
import {
  interruptAndDrainReconciler,
  pauseAndDrainReconciler,
  reinitializeReconciler,
  setReconcilerPaused,
} from "../../core/pipeline/reconciler-client";
import { invalidatePrefs } from "../../core/prefs";
import { closePreviewWindows } from "../../core/preview-windows";
import {
  closeQuickCapture,
  keepQuickCaptureDraft,
} from "../../core/quick-capture-overlay";
import { invalidateStorageSnapshot } from "../../core/storage-stats";
import {
  startStorageWatcher,
  stopStorageWatcher,
} from "../../core/storage-watcher";
import { recoverInterruptedSyncs } from "../../core/sync";
import { startLaunchSync } from "../../core/sync/launch";
import { cancelAllSyncs, inFlight } from "../../core/sync/sync-status";
import { flushTagsDump, hydrateTagsFromBundle } from "../../core/tags-bundle";
import { clearUndoHistory } from "../../core/undo";
import { closeDb } from "../../db";
import { broadcast } from "../../lib/broadcast";
import { rotateBundleBackups } from "../../lib/library-config";
import {
  startLibraryBackgroundWork,
  stopLibraryBackgroundWork,
  watchLibraryFolder,
} from "../../library-services";
import { invalidatePaths, resolvePaths } from "../../paths";
import { getMainWindow, queueTrayRefresh } from "../../window";

/** Bounds how long a cancelled sync or agent reply may take to settle before its Library closes. */
const SETTLE_MS = 5000;

const libraryWork = createLibraryWorkCoordinator({
  stopAutoImport,
  stopLibraryTransfers,
  pauseAndDrainReconciler,
  interruptAndDrainReconciler,
  suspendMutations,
  resumeMutations,
  resumeLibraryTransfers,
  setReconcilerPaused,
  startAutoImport,
  warn: (message, error) => log.warn(message, error),
});

export async function suspendLibraryWork(
  mode?: LibraryWorkSuspension,
): Promise<void> {
  await libraryWork.suspend(mode);
}

export async function resumeLibraryWork(): Promise<void> {
  await libraryWork.resume();
}

let locationChange: Promise<void> = Promise.resolve();

export async function serializeLocationChange<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const next = locationChange.then(operation);
  locationChange = next.then(
    () => {},
    () => {},
  );
  return next;
}

export function waitForLibraryLocationChanges(): Promise<void> {
  return locationChange;
}

export async function librarySwitchTarget(
  root: string,
): Promise<LibrarySwitchTarget> {
  const identity = await readLibraryIdentity(root);
  return { name: identity.name, icon: identity.icon };
}

export function announceLibrarySwitch(event: LibrarySwitchEvent): void {
  broadcast(IPC.librarySwitch, event);
}

/** Announces the switch, then names what it waits on while a transfer finishes. */
export function announceLibraryOpening(library: LibrarySwitchTarget): void {
  announceLibrarySwitch({
    phase: "opening",
    library,
    waiting: libraryTransfersRunning() ? "transfer" : null,
  });
}

async function settle(done: () => boolean): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  while (!done() && Date.now() < deadline) {
    await sleep(50);
  }
}

/**
 * Closes the open Library's index and services, then opens the Library the pointer now names in this process.
 * @remarks Callers suspend library work and commit the pointer first.
 */
export async function reopenLibrary(): Promise<void> {
  log.info("[pond library-ops] opening library in place");
  closePreviewWindows();
  closeCombineImagesWindow();
  closeFileRingOverlay();
  closeQuickCapture();
  keepQuickCaptureDraft(null);
  stopLibraryBackgroundWork();
  stopStorageWatcher();
  libraryHealthService.cancel();
  cancelAllSyncs();
  stopAllMessages();
  await Promise.all([
    settle(() => inFlight.size === 0),
    settle(() => !hasActiveMessages()),
    fishMcp
      .closeAll()
      .catch((cause: unknown) =>
        log.warn("[pond library-ops] fish MCP close failed", cause),
      ),
  ]);
  await flushTagsDump().catch((cause: unknown) =>
    log.warn("[pond library-ops] tags.json flush failed", cause),
  );

  downloadActivity.reset();
  closeDb();
  invalidatePaths();
  invalidatePrefs();
  invalidateStorageSnapshot();
  clearUndoHistory();
  resumeMutations();

  try {
    const paths = resolvePaths();
    rotateBundleBackups(paths.backupDir, [
      paths.libraryMetadata,
      paths.settingsFile,
      paths.tagsFile,
    ]);
  } catch (error) {
    log.warn("[pond library-ops] bundle backup rotation failed", error);
  }
  await hydrateTagsFromBundle().catch((cause: unknown) =>
    log.warn("[pond library-ops] tags.json hydrate failed", cause),
  );
  await reinitializeReconciler().catch((cause: unknown) =>
    log.warn("[pond library-ops] queue recovery failed", cause),
  );
  await resumeLibraryWork();
  await startStorageWatcher().catch((cause: unknown) =>
    log.warn("[pond library-ops] storage watcher failed to start", cause),
  );
  await recoverInterruptedSyncs().catch((cause: unknown) =>
    log.warn("[pond library-ops] interrupted-sync recovery failed", cause),
  );
  void captures
    .recover()
    .catch((cause: unknown) =>
      log.warn("[pond library-ops] capture recovery failed", cause),
    );
  void startLaunchSync().catch((cause: unknown) =>
    log.warn("[pond library-ops] launch sync failed to start", cause),
  );
  watchLibraryFolder();
  void startLibraryBackgroundWork().catch((cause: unknown) =>
    log.warn("[pond library-ops] library background work failed", cause),
  );
  queueTrayRefresh();

  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.reload();
  }
}
