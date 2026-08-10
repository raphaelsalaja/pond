import { existsSync, mkdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { app, globalShortcut, ipcMain } from "electron";
import log from "electron-log/main.js";
import {
  DEFAULT_INGEST_PORT,
  IPC,
  type RecentMenuEntry,
} from "../shared/constants";
import { backfillEnrichmentSidecars } from "./core/enrichment-sidecar";
import { ensureDefaultLibrary } from "./core/ensure-default-library";
import { registerSyncActionListener } from "./core/executor";
import { syncLibraryRootMetadata } from "./core/library-ops";
import { startMediaWarmer, stopMediaWarmer } from "./core/media-warm/service";
import { flushGovernor } from "./core/pipeline/rate-governor";
import { startReconciler } from "./core/pipeline/reconciler";
import { getPrefs, invalidatePrefs } from "./core/prefs";
import { startArchiveBackfill } from "./core/refresh/archive-backfill";
import { disposeHiddenWindow } from "./core/refresh/scrape-window";
import { backfillSourceIcons } from "./core/refresh/source-icon-backfill";
import { disposeRenderCardWindow } from "./core/render-card";
import { reconcileLibrary } from "./core/scan";
import {
  startStorageWatcher,
  stopStorageWatcher,
} from "./core/storage-watcher";
import {
  migrateLegacySyncPrefs,
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
import { handleDeepLink } from "./deep-link";
import { type RunningServer, startHttpServer } from "./http/server";
import { registerIpc } from "./ipc";
import { ensureIngestToken } from "./keychain";
import { broadcast } from "./lib/broadcast";
import { rotateBundleBackups } from "./lib/library-config";
import { installAppMenu, setMenuRecents } from "./menu";
import { libraryRoot, resolvePaths } from "./paths";
import { registerProtocol, registerScheme } from "./protocol";
import { configureSessionDefaults } from "./session-config";
import { setTrayVisible } from "./tray";
import { registerAutoUpdater } from "./updater";
import {
  beginQuit,
  createWindow,
  focusedOrMain,
  getMainWindow,
  handleActivate,
  hasTray,
  initTray,
  openLibraryWindow,
  queueTrayRefresh,
  setCloseToTray,
  summonMainWindow,
} from "./window";

/** Force app.name before any menu/dock work; dev falls back to "Electron" otherwise. */
app.setName("Pond");

/** POND_SANDBOX redirects all app state for first-run testing; dev and packaged builds otherwise share ~/Library/Application Support/Pond and ~/Pond. */
if (process.env.POND_SANDBOX) {
  const sandbox = resolvePath(process.env.POND_SANDBOX);
  /** setPath does not create directories, and Chromium expects sessionData to exist. */
  for (const [name, dir] of [
    ["userData", join(sandbox, "app-data")],
    ["sessionData", join(sandbox, "chromium")],
    ["logs", join(sandbox, "logs")],
    /** Home too, so the default ~/Pond/My Pond.pond bundle lands in the sandbox instead of adopting the real one. */
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

log.initialize();
log.info("[pond] main starting", {
  version: app.getVersion(),
  platform: process.platform,
});

let httpServer: RunningServer | null = null;

const broadcastSyncStatus = (status: SyncStatusUpdate): void =>
  broadcast(IPC.syncStatus, status);

registerScheme();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("pond", process.execPath, [
      resolvePath(process.argv[1] ?? ""),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("pond");
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url, getMainWindow());
});

app.on("second-instance", (_event, argv) => {
  const url = argv.find((a) => a.startsWith("pond://"));
  if (url) handleDeepLink(url, getMainWindow());
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.whenReady().then(async () => {
  /** Packaged builds take the Dock icon from the app bundle; amber mark in unpackaged dev. */
  if (process.platform === "darwin" && !app.isPackaged) {
    const iconPath = join(__dirname, "../../build/icon.development.png");
    if (existsSync(iconPath)) app.dock?.setIcon(iconPath);
  }

  ensureDefaultLibrary();
  const paths = resolvePaths();
  log.info("[pond] paths", paths);

  configureSessionDefaults();

  await ensureIngestToken();
  registerProtocol();

  try {
    await getDb();
  } catch (err) {
    log.error("[pond] db init failed", err);
  }

  registerIpc();
  installAppMenu({
    focusedOrMain,
    openLibraryWindow: () => void openLibraryWindow(),
  });

  /** The renderer owns the recently-visited saves; mirror them into the native History menu whenever they change. */
  ipcMain.on(IPC.menuRecents, (_event, entries: RecentMenuEntry[]) => {
    setMenuRecents(Array.isArray(entries) ? entries : []);
  });

  const loginItem = app.getLoginItemSettings();
  const wantsLaunchHidden = await getPrefs()
    .then((p) => p.window.launchHidden === true)
    .catch(() => false);
  setCloseToTray(
    await getPrefs()
      .then((p) => p.window.closeToTray === true)
      .catch(() => false),
  );
  const launchedHidden =
    wantsLaunchHidden ||
    loginItem.wasOpenedAsHidden === true ||
    loginItem.wasOpenedAtLogin === true;
  if (!launchedHidden) {
    await createWindow();
  }

  app.on("activate", () => void handleActivate());

  void postLaunchInit().catch((err) =>
    log.error("[pond] post-launch init failed", err),
  );
});

async function postLaunchInit(): Promise<void> {
  registerSummonHotkey();
  registerAutoUpdater();

  try {
    await syncLibraryRootMetadata();
    /** Don't snapshot a not-yet-created library; it materializes on first write. */
    if (existsSync(libraryRoot())) {
      snapshotBundleJsons();
    }
  } catch (err) {
    log.warn("[pond] recording active library failed", err);
  }

  /** Tag colors/groups live in the bundle's tags.json; a fresh index hydrates from it before anything queries tags. */
  try {
    await hydrateTagsFromBundle();
  } catch (err) {
    log.warn("[pond] tags.json hydrate failed", err);
  }

  void reconcileLibrary()
    .catch((err) => log.warn("[pond] scan failed", err))
    /** Preview warming can begin as soon as the durable index is reconciled; slower maintenance backfills continue alongside it. */
    .finally(() => startMediaWarmer())
    /** Self-heal saves whose archives predate the current WARC format; no-op when everything is current. */
    .then(() => startArchiveBackfill())
    .catch((err) => log.warn("[pond] archive backfill failed", err))
    /** Web saves ingested before favicon capture get their source icon filled in; no-op once every save has one. */
    .then(() => backfillSourceIcons())
    .catch((err) => log.warn("[pond] source icon backfill failed", err));
  void backfillEnrichmentSidecars().catch((err) =>
    log.warn("[pond] enrichment sidecar backfill failed", err),
  );
  startReconciler();

  try {
    const prefs = await getPrefs();
    httpServer = await startHttpServer(
      prefs.api.port || DEFAULT_INGEST_PORT,
      prefs.api.bindAddress,
    );
  } catch (err) {
    log.error("[pond] http server failed to start", err);
  }

  /** Legacy single-account prefs must fold into the account registry before recovery/crons touch per-account sync state. */
  try {
    await migrateLegacySyncPrefs();
  } catch (err) {
    log.warn("[pond] legacy sync-prefs migration failed", err);
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

  await initTray();
  registerSyncActionListener(() => queueTrayRefresh());

  void applyPrefsAtRuntime().catch((err) =>
    log.warn("[pond] applyPrefsAtRuntime failed", err),
  );

  subscribeToSyncStatus(broadcastSyncStatus);
}

/** Guards the single-writer root JSONs against a bad cloud sync or crash with a rolling snapshot on every open. */
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

function registerSummonHotkey() {
  const isMac = process.platform === "darwin";
  const summonAccel = isMac ? "Command+Shift+L" : "Control+Shift+L";
  const ok = globalShortcut.register(
    summonAccel,
    () => void summonMainWindow(),
  );
  if (!ok) log.warn(`[pond] summon hotkey ${summonAccel} not registered`);
}

export async function applyPrefsAtRuntime() {
  invalidatePrefs();
  const prefs = await getPrefs();
  await setTrayVisible(prefs.quickCapture.menuBarIcon);
  /** Dev binaries can't register a login item; macOS rejects it. */
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: prefs.quickCapture.launchAtLogin,
      openAsHidden: true,
    });
  }
  setCloseToTray(prefs.window.closeToTray === true);
}

export async function applyWindowPrefsAtRuntime() {
  invalidatePrefs();
  const prefs = await getPrefs();
  setCloseToTray(prefs.window.closeToTray === true);
}

export async function restartHttpServer(): Promise<{
  port: number;
  host: string;
}> {
  invalidatePrefs();
  const prefs = await getPrefs();
  if (httpServer) {
    try {
      await httpServer.close();
    } catch (err) {
      log.warn("[pond] http close failed", err);
    }
  }
  httpServer = await startHttpServer(
    prefs.api.port || DEFAULT_INGEST_PORT,
    prefs.api.bindAddress,
  );
  return { port: httpServer.port, host: httpServer.host };
}

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    app.dock?.hide();
    return;
  }
  if (hasTray()) return;
  app.quit();
});

app.on("before-quit", async () => {
  beginQuit();
  stopMediaWarmer();
  globalShortcut.unregisterAll();
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
  try {
    await httpServer?.close();
  } catch (err) {
    log.warn("[pond] http server close failed", err);
  }
});
