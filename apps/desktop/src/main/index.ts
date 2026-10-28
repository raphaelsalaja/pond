import { existsSync, mkdirSync } from "node:fs";
import type { Server as NetServer } from "node:net";
import { join, resolve as resolvePath } from "node:path";
import { app, globalShortcut, ipcMain, powerMonitor } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_APP_ICON } from "../shared/app-icons";
import { IPC, type RecentMenuEntry } from "../shared/constants";
import type { ShortcutId } from "../shared/shortcuts";
import { fishMcp } from "./core/agent/fish-mcp/live";
import { startAutoImport, stopAutoImport } from "./core/auto-import";
import { captures } from "./core/captures";
import {
  closeCombineImagesWindow,
  registerCombineImagesWindowIpc,
} from "./core/combine-images-window";
import { ensureDefaultLibrary } from "./core/ensure-default-library";
import { registerSyncActionListener } from "./core/executor";
import { startFishRoutines } from "./core/fish";
import {
  startGlobalShortcuts,
  summonShortcutTarget,
} from "./core/global-shortcuts";
import { syncLibraryRootMetadata } from "./core/library-ops";
import { stopLibraryTransfers } from "./core/library-transfers";
import { startMachinePace } from "./core/machine-pace";
import { flushGovernor } from "./core/pipeline/rate-governor";
import {
  resumeReconcilerAfterSuspend,
  startReconciler,
  suspendReconciler,
} from "./core/pipeline/reconciler-client";
import { disposeQueueWorkerHost } from "./core/pipeline/worker-host";
import { getPrefs, subscribePrefs } from "./core/prefs";
import { closePreviewWindows } from "./core/preview-windows";
import { disposeHiddenWindow } from "./core/refresh/harvest-window";
import { disposeRenderCardWindow } from "./core/render-card";
import {
  startStorageWatcher,
  stopStorageWatcher,
} from "./core/storage-watcher";
import {
  recoverInterruptedSyncs,
  type SyncStatusUpdate,
  subscribeToSyncStatus,
} from "./core/sync";
import { flushTagsDump, hydrateTagsFromBundle } from "./core/tags-bundle";
import {
  registerSyncCron,
  registerTrashCron,
  registerYtDlpUpdateCron,
} from "./crons";
import { getDb } from "./db";
import {
  deepLinkArg,
  handleDeepLink,
  handleSecondInstance,
  shouldOpenInitialWindow,
} from "./deep-link";
import { markSaveLinksReady } from "./deep-link-save";
import { settleDockAfterClose } from "./dock";
import { registerIpc } from "./ipc";
import { waitForLibraryLocationChanges } from "./ipc/queries/library-locations";
import { ensureIngestToken } from "./keychain";
import { broadcast } from "./lib/broadcast";
import { rotateBundleBackups } from "./lib/library-config";
import { LibraryMetadataError } from "./lib/library-id";
import { disableMenuActionImages } from "./lib/menu-action-images";
import { killTrackedProcessTrees } from "./lib/process-tree";
import { recoverUnreadableLibrary } from "./library-recovery";
import {
  consoleLoggingEnabled,
  protocolRegistration,
  resolveLaunchHidden,
  shouldStayResident,
} from "./lifecycle";
import { resolveLogFile } from "./logging";
import { installAppMenu, setMenuRecents } from "./menu";
import { writeNativeHostManifests } from "./native/manifests";
import { safariSocketPath } from "./native/paths";
import { startNativeServer, stopNativeServer } from "./native/server";
import { flushOpenFiles, queueOpenFile } from "./open-files";
import { libraryRoot, type PondPaths, resolvePaths } from "./paths";
import { registerProtocol, registerScheme } from "./protocol";
import { LOGIN_LAUNCH_ARG, runtimeControls } from "./runtime";
import { configureSessionDefaults } from "./session-config";
import {
  acquireSingleInstanceLock,
  isProcessAlive,
  singletonLockHolder,
} from "./single-instance";
import {
  logStartupTiming,
  markStartup,
  watchMainThreadStalls,
} from "./startup-timing";
import { registerAutoUpdater } from "./updater";
import {
  beginQuit,
  createWindow,
  focusedOrMain,
  getMainWindow,
  handleActivate,
  hasTray,
  initTray,
  isCloseToTrayEnabled,
  openLibraryWindow,
  queueTrayRefresh,
  setCloseToTray,
  summonMainWindow,
} from "./window";

markStartup("modules-loaded");

/** Force app.name before any menu/dock work; dev falls back to "Electron" otherwise. */
app.setName("Pond");
disableMenuActionImages();

if (process.env.POND_SANDBOX) {
  const sandbox = resolvePath(process.env.POND_SANDBOX);
  /** setPath does not create directories, and Chromium expects sessionData to exist. */
  for (const [name, dir] of [
    ["userData", join(sandbox, "app-data")],
    ["sessionData", join(sandbox, "chromium")],
    ["logs", join(sandbox, "logs")],
    ["home", join(sandbox, "home")],
  ] as const) {
    mkdirSync(dir, { recursive: true });
    app.setPath(name, dir);
  }
}
if (process.platform === "darwin") {
  app.setAboutPanelOptions({
    applicationName: "Pond",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Raphael Salaja",
  });
}

if (process.platform === "win32") app.setAppUserModelId("so.pond.desktop");

const logFile = resolveLogFile(app);
if (logFile) log.transports.file.resolvePathFn = () => logFile;
else log.transports.file.level = false;
log.initialize();
if (!consoleLoggingEnabled(process.argv)) log.transports.console.level = false;
log.info("[pond] main starting", {
  version: app.getVersion(),
  platform: process.platform,
});

const wantsMcp = process.argv.includes("--mcp");
/** Each MCP client spawns its own headless process, and none of them ever opens a window. */
if (wantsMcp) app.dock?.hide();
const initialDeepLink = deepLinkArg(process.argv);

let nativeServer: NetServer | null = null;
let safariServer: NetServer | null = null;
let stopMediaWarmer: (() => void) | null = null;

let signalRendererReady: (() => void) | null = null;
const rendererReady = new Promise<void>((resolve) => {
  signalRendererReady = resolve;
});
ipcMain.once(IPC.rendererReady, () => {
  markStartup("renderer-ready");
  logStartupTiming();
  signalRendererReady?.();
  signalRendererReady = null;
});

const broadcastSyncStatus = (status: SyncStatusUpdate): void =>
  broadcast(IPC.syncStatus, status);

registerScheme();

const singleInstanceLock = wantsMcp
  ? Promise.resolve(true)
  : acquireSingleInstanceLock({
      request: () => app.requestSingleInstanceLock(),
      waitForPredecessor: !app.isPackaged,
      holder: () => singletonLockHolder(app.getPath("userData")),
      isAlive: isProcessAlive,
    });
void singleInstanceLock.then((acquired) => {
  if (!acquired) {
    log.warn("[pond] another Pond instance holds the lock; quitting");
    app.quit();
    return;
  }
  const protocolMode = protocolRegistration({
    platform: process.platform,
    hasInstanceLock: acquired,
    sandboxed: Boolean(process.env.POND_SANDBOX),
    defaultApp: Boolean(process.defaultApp),
  });
  if (protocolMode === "development") {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("pond", process.execPath, [
        resolvePath(process.argv[1] ?? ""),
      ]);
    }
  } else if (protocolMode === "packaged") {
    app.setAsDefaultProtocolClient("pond");
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  const destination = handleDeepLink(url, getMainWindow());
  if (app.isReady() && destination === "library") void openLibraryWindow();
});

let started = false;
/** Set once startup has decided on the initial window and IPC is registered. */
let launched = false;
let quitPrepared = false;
let quitPreparing = false;

app.on("second-instance", (_event, argv) => {
  /** Showing a window while quitting cancels the quit, and this instance would keep the lock. */
  if (quitPreparing) return;
  if (!launched) {
    // Too early to open a window; the initial window picks up the stored link.
    const url = deepLinkArg(argv);
    if (url) handleDeepLink(url, null);
    return;
  }
  handleSecondInstance(argv, {
    handleDeepLink,
    getMainWindow,
    openLibraryWindow,
  });
});

const flushDroppedFiles = () =>
  void flushOpenFiles({ openLibraryWindow, getMainWindow }).catch((err) =>
    log.error("[pond] open-file import failed", err),
  );

/** macOS sends files dropped on the Dock icon here, also when they launch Pond. */
app.on("open-file", (event, path) => {
  event.preventDefault();
  queueOpenFile(path);
  if (launched && !quitPreparing) setImmediate(flushDroppedFiles);
});

app.whenReady().then(async () => {
  if (!(await singleInstanceLock) || quitPreparing) return;
  started = true;
  markStartup("app-ready");
  if (process.platform === "darwin" && !app.isPackaged) {
    const { applyAppIcon } = await import("./core/app-icon");
    await applyAppIcon(DEFAULT_APP_ICON);
  }

  const paths = await openActiveLibrary();
  if (!paths) return;
  log.info("[pond] paths", paths);
  const initialDestination = initialDeepLink
    ? handleDeepLink(initialDeepLink, getMainWindow())
    : undefined;

  configureSessionDefaults();

  registerProtocol();

  if (wantsMcp) {
    await ensureIngestToken().catch((err) =>
      log.error("[pond] ingest token init failed; MCP starts without one", err),
    );
    const { startPondMcp } = await import("./core/agent/mcp");
    await startPondMcp();
    return;
  }

  registerIpc();
  startMachinePace();
  if (!process.env.POND_SANDBOX) registerAutoUpdater();
  subscribePrefs((prefs) => broadcast(IPC.prefsChanged, prefs));
  registerCombineImagesWindowIpc();
  const menuPrefs = await getPrefs();
  installAppMenu({
    shortcuts: menuPrefs.shortcuts,
    focusedOrMain,
    openLibraryWindow: () => void openLibraryWindow(),
  });

  ipcMain.on(IPC.menuRecents, (_event, entries: RecentMenuEntry[]) => {
    setMenuRecents(Array.isArray(entries) ? entries : []);
  });

  const loginItem = app.getLoginItemSettings();
  const launchPrefs = await getPrefs().catch(() => null);
  const wantsLaunchHidden = launchPrefs?.window.launchHidden === true;
  setCloseToTray(launchPrefs?.window.closeToTray === true);
  const launchedHidden = resolveLaunchHidden({
    platform: process.platform,
    requested:
      wantsLaunchHidden ||
      loginItem.wasOpenedAtLogin === true ||
      (process.platform === "win32" && process.argv.includes(LOGIN_LAUNCH_ARG)),
    trayEnabled: launchPrefs?.quickCapture.menuBarIcon !== false,
  });
  if (shouldOpenInitialWindow(launchedHidden, initialDestination)) {
    await createWindow();
  } else {
    void settleDockAfterClose();
  }
  launched = true;
  flushDroppedFiles();
  watchMainThreadStalls();

  const [tokenResult, dbResult] = await Promise.allSettled([
    ensureIngestToken(),
    getDb(),
  ]);
  if (tokenResult.status === "rejected") {
    log.error("[pond] ingest token init failed", tokenResult.reason);
  }
  if (dbResult.status === "rejected") {
    log.error("[pond] db init failed", dbResult.reason);
  } else {
    markSaveLinksReady();
  }

  app.on("activate", () => void handleActivate());

  void postLaunchInit().catch((err) =>
    log.error("[pond] post-launch init failed", err),
  );
});

async function openActiveLibrary(): Promise<PondPaths | null> {
  try {
    ensureDefaultLibrary();
    return resolvePaths();
  } catch (error) {
    if (!(error instanceof LibraryMetadataError)) throw error;
    log.error("[pond] Library metadata is unreadable", error.file, error.cause);
    if (wantsMcp) app.exit(1);
    else await recoverUnreadableLibrary(error);
    return null;
  }
}

async function postLaunchInit(): Promise<void> {
  if (!process.env.POND_SANDBOX) {
    await registerSummonHotkey();
  }

  try {
    await syncLibraryRootMetadata();
    if (existsSync(libraryRoot())) {
      snapshotBundleJsons();
    }
  } catch (err) {
    log.warn("[pond] recording active library failed", err);
  }

  try {
    await hydrateTagsFromBundle();
  } catch (err) {
    log.warn("[pond] tags.json hydrate failed", err);
  }

  void startDeferredMaintenance();

  try {
    if (!process.env.POND_SANDBOX) await runtimeControls.startHttpServer();
  } catch (err) {
    log.error("[pond] http server failed to start", err);
  }

  try {
    nativeServer = await startNativeServer();
  } catch (err) {
    log.error("[pond] native host failed to start", err);
  }
  /** Only a signed build carries the App Group entitlement that opens the shared container. */
  if (
    process.platform === "darwin" &&
    app.isPackaged &&
    !process.env.POND_SANDBOX
  ) {
    try {
      safariServer = await startNativeServer({ path: safariSocketPath() });
    } catch (err) {
      log.error("[pond] Safari native host failed to start", err);
    }
  }
  /** Manifests must keep pointing at the real app, and registration never depends on the socket binding. */
  if (!process.env.POND_SANDBOX) {
    try {
      await writeNativeHostManifests();
    } catch (err) {
      log.error("[pond] native host registration failed", err);
    }
  }

  void recoverInterruptedSyncs().catch((err) =>
    log.warn("[pond] interrupted-sync recovery failed", err),
  );
  registerTrashCron();
  registerYtDlpUpdateCron();
  registerSyncCron();
  void startStorageWatcher().catch((err) =>
    log.warn("[pond] storage watcher failed to start", err),
  );
  void captures
    .recover()
    .catch((error) => log.warn("[pond] capture recovery failed", error));
  void startAutoImport().catch((err) =>
    log.warn("[pond] auto-import failed to start", err),
  );

  await initTray();
  registerSyncActionListener(() => queueTrayRefresh());
  startFishRoutines({ onSyncAction: registerSyncActionListener });

  void runtimeControls
    .applyPrefsAtRuntime()
    .catch((err) => log.warn("[pond] applyPrefsAtRuntime failed", err));

  subscribeToSyncStatus(broadcastSyncStatus);
}

async function startDeferredMaintenance(): Promise<void> {
  const fallback = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    timer.unref();
  });
  await Promise.race([rendererReady, fallback]);
  startReconciler();
  powerMonitor.on("suspend", () => {
    void suspendReconciler();
  });
  powerMonitor.on("resume", () => {
    void resumeReconcilerAfterSuspend();
  });

  const [scanModule, mediaModule, enrichmentModule] = await Promise.all([
    import("./core/scan"),
    import("./core/media-warm/service"),
    import("./core/enrichment-sidecar"),
  ]);
  stopMediaWarmer = mediaModule.stopMediaWarmer;

  void scanModule
    .reconcileLibrary()
    .catch((err) => log.warn("[pond] scan failed", err))
    .finally(() => mediaModule.startMediaWarmer())
    .then(async () =>
      (await import("./core/refresh/archive-backfill")).startArchiveBackfill(),
    )
    .catch((err) => log.warn("[pond] archive backfill failed", err))
    .then(async () =>
      (
        await import("./core/refresh/threads-card-backfill")
      ).startThreadsCardBackfill(),
    )
    .catch((err) => log.warn("[pond] native card backfill failed", err))
    .then(async () =>
      (
        await import("./core/refresh/source-icon-backfill")
      ).backfillSourceIcons(),
    )
    .catch((err) => log.warn("[pond] source icon backfill failed", err))
    .then(async () =>
      (await import("./core/refresh/article-backfill")).startArticleBackfill(),
    )
    .catch((err) => log.warn("[pond] article backfill failed", err));
  void enrichmentModule
    .backfillEnrichmentSidecars()
    .catch((err) => log.warn("[pond] enrichment sidecar backfill failed", err));
}

function snapshotBundleJsons(): void {
  try {
    const paths = resolvePaths();
    rotateBundleBackups(paths.backupDir, [
      paths.libraryMetadata,
      paths.settingsFile,
      paths.tagsFile,
    ]);
  } catch (err) {
    log.warn("[pond] bundle backup snapshot failed", err);
  }
}

async function registerSummonHotkey() {
  const run = (action: () => Promise<void>) => () => {
    void action().catch((error) => log.warn("[pond shortcut]", error));
  };
  startGlobalShortcuts(
    globalShortcut,
    {
      "app.summon": run(async () => {
        const { shortcuts } = await getPrefs();
        const win = getMainWindow();
        if (
          summonShortcutTarget(
            shortcuts.overrides,
            Boolean(win && !win.isDestroyed() && win.isFocused()),
            process.platform === "darwin",
          ) === "renderer"
        ) {
          win?.webContents.send(
            IPC.shortcutAction,
            "view.layout-cycle" satisfies ShortcutId,
          );
          return;
        }
        await summonMainWindow();
      }),
    },
    (await getPrefs()).shortcuts.overrides,
  );
}

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    void settleDockAfterClose();
    return;
  }
  if (
    shouldStayResident({
      platform: process.platform,
      closeToTray: isCloseToTrayEnabled(),
      hasTray: hasTray(),
    })
  ) {
    return;
  }
  app.quit();
});

const SERVER_CLOSE_MS = 3_000;
const QUIT_STALL_MS = 5_000;

function withDeadline(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

if (process.platform === "win32") {
  // Windows ends the session without emitting before-quit, so flush what cannot be rebuilt.
  app.on("browser-window-created", (_event, win) => {
    win.once("session-end", () => {
      beginQuit();
      killTrackedProcessTrees();
      try {
        flushGovernor();
      } catch (err) {
        log.warn("[pond] governor flush failed", err);
      }
      void flushTagsDump().catch((err) =>
        log.warn("[pond] tags.json flush failed", err),
      );
    });
  });
}

app.on("before-quit", async (event) => {
  if (quitPrepared) return;
  if (!started) {
    quitPreparing = true;
    return;
  }
  event.preventDefault();
  if (quitPreparing) return;
  quitPreparing = true;
  beginQuit();
  stopMediaWarmer?.();
  globalShortcut.unregisterAll();
  try {
    await waitForLibraryLocationChanges();
    await stopAutoImport();
    await stopLibraryTransfers();
  } catch (error) {
    log.warn("[pond] auto import shutdown failed", error);
  }
  try {
    await flushTagsDump();
  } catch (err) {
    log.warn("[pond] tags.json flush failed", err);
  }
  try {
    stopStorageWatcher();
  } catch (err) {
    log.warn("[pond] storage watcher stop failed", err);
  }
  try {
    flushGovernor();
  } catch (err) {
    log.warn("[pond] governor flush failed", err);
  }
  try {
    disposeHiddenWindow();
  } catch (err) {
    log.warn("[pond] hidden window dispose failed", err);
  }
  try {
    disposeRenderCardWindow();
  } catch (err) {
    log.warn("[pond] render-card window dispose failed", err);
  }
  disposeQueueWorkerHost();
  killTrackedProcessTrees();
  closePreviewWindows();
  closeCombineImagesWindow();
  try {
    await withDeadline(
      Promise.all([
        stopNativeServer(nativeServer),
        stopNativeServer(safariServer),
      ]).then(() => undefined),
      SERVER_CLOSE_MS,
    );
    nativeServer = null;
    safariServer = null;
  } catch (err) {
    log.warn("[pond] native host close failed", err);
  }
  try {
    await withDeadline(runtimeControls.closeHttpServer(), SERVER_CLOSE_MS);
  } catch (err) {
    log.warn("[pond] http server close failed", err);
  }
  try {
    await withDeadline(fishMcp.closeAll(), SERVER_CLOSE_MS);
  } catch (err) {
    log.warn("[pond] fish MCP close failed", err);
  }
  log.info("[pond] quit prepared");
  quitPrepared = true;
  /** Everything is flushed by now; a window that refuses to close must not keep Pond running. */
  setTimeout(() => {
    log.warn("[pond] quit stalled; exiting");
    app.exit(0);
  }, QUIT_STALL_MS).unref();
  app.quit();
});
