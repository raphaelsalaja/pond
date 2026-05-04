import { join } from "node:path";
import { app, BrowserWindow, globalShortcut, Menu, shell } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_INGEST_PORT, IPC } from "../shared/constants";
import {
  type AutoVideoStatus,
  autoVideoQueueSnapshot,
  subscribeToAutoVideoStatus,
} from "./core/auto-video";
import { startBackupCron } from "./core/backups";
import { startEnrichWorker } from "./core/enrich";
import {
  registerSyncActionListener,
  replayPendingTransactions,
} from "./core/executor";
import { emptyTrashOlderThan } from "./core/library-ops";
import { getPrefs, invalidatePrefs } from "./core/prefs";
import { isSourceConnected } from "./core/refresh";
import { disposeHiddenWindow } from "./core/refresh/scrape-window";
import { reconcileLibrary } from "./core/scan";
import {
  patchSourceSync,
  type SyncStatusUpdate,
  subscribeToSyncStatus,
  syncSource,
} from "./core/sync";
import { canRedo, canUndo, redo, undo } from "./core/undo";
import { getDb } from "./db";
import { type RunningServer, startHttpServer } from "./http/server";
import { registerIpc } from "./ipc";
import { ensureIngestToken } from "./keychain";
import { resolvePaths } from "./paths";
import { registerProtocol, registerScheme } from "./protocol";
import { ensureTray, setTrayVisible, type TrayHandle } from "./tray";
import { registerAutoUpdater } from "./updater";

log.initialize();
log.info("[pond] main starting", {
  version: app.getVersion(),
  platform: process.platform,
});

let httpServer: RunningServer | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: TrayHandle | null = null;
let trayRefreshQueued = false;

function queueTrayRefresh() {
  if (!tray || trayRefreshQueued) return;
  trayRefreshQueued = true;
  setTimeout(() => {
    trayRefreshQueued = false;
    void tray?.refresh();
  }, 150);
}

/**
 * Push an auto-video queue snapshot to every live renderer. Used as the
 * subscription callback for `subscribeToAutoVideoStatus`. Cheap — the
 * payload is two arrays of save IDs, sent at most once per queue
 * mutation.
 */
function broadcastAutoVideoStatus(status: AutoVideoStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.autoVideoStatus, status);
    }
  }
}

/**
 * Push every sync orchestrator status event to every live renderer.
 * Same shape as `broadcastAutoVideoStatus`: subscribe in main once at
 * startup so the events keep flowing whether or not a window is open.
 */
function broadcastSyncStatus(status: SyncStatusUpdate): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.syncStatus, status);
    }
  }
}

/**
 * `pond` is a menu-bar / background app first. Register the protocol
 * scheme before `ready`; everything else runs after.
 */
registerScheme();

async function createWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Linear-style chrome: hide the OS titlebar and let the traffic
    // lights float over our own header. Mac only — other platforms get
    // the default frame, which already renders flush.
    titleBarStyle: isMac ? "hiddenInset" : "default",
    // The cluster is ~12px tall, so y = (headerHeight - 12) / 2 keeps
    // them optically centered. Bar is 44px → y = 16.
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  // Catch newly-opened renderers up to the current auto-video queue
  // state — without this, a window that opens *between* queue mutations
  // would never see the in-flight downloads it needs to paint badges
  // for. Cheap (one IPC send), idempotent on the renderer side.
  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send(IPC.autoVideoStatus, autoVideoQueueSnapshot());
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    // DevTools is opt-in even in dev — historically we auto-popped it
    // every launch, but the detached window steals focus from the editor
    // every restart and most iterations don't need it. Set
    // POND_OPEN_DEVTOOLS=1 (or POND_DEVTOOLS=1) in your shell to bring it
    // back automatically; otherwise Cmd+Opt+I from the focused renderer
    // toggles it on demand.
    if (
      process.env.POND_OPEN_DEVTOOLS === "1" ||
      process.env.POND_DEVTOOLS === "1"
    ) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(async () => {
  const paths = resolvePaths();
  log.info("[pond] paths", paths);

  // Register `pond://` as a system-wide protocol so the URLs the
  // Integrations settings page documents (pond://item/<id>,
  // pond://search?q=…, pond://capture?url=…) actually open the app
  // when invoked from Raycast / Apple Shortcuts / Slack.
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("pond", process.execPath, [
        require("node:path").resolve(process.argv[1] ?? ""),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("pond");
  }

  await ensureIngestToken();
  registerProtocol();
  registerIpc();

  try {
    await getDb();
    await replayPendingTransactions();
    // Run the library reconcile in the background so the first window
    // frame isn't blocked on disk scanning.
    void reconcileLibrary().catch((err) => log.warn("[pond] scan failed", err));
    // Background AI enrichment worker. Idempotent if already running;
    // does nothing useful when AI provider is `off` except for the
    // always-local colour extraction job.
    startEnrichWorker();
  } catch (err) {
    log.error("[pond] db init failed", err);
  }

  try {
    const prefs = await getPrefs();
    httpServer = await startHttpServer(
      prefs.api.port || DEFAULT_INGEST_PORT,
      prefs.api.bindAddress,
    );
  } catch (err) {
    log.error("[pond] http server failed to start", err);
  }

  registerUndoHotkeys();
  registerQuickSaveHotkey();
  registerAutoUpdater();
  registerTrashCron();
  registerSyncCron();
  startBackupCron();
  installAppMenu();

  const openLibrary = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = await createWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  try {
    // Always boot the tray so we can refresh it when prefs flip on.
    // The user's `menuBarIcon` pref then decides whether it stays
    // visible — `applyPrefsAtRuntime` flips it off below if needed.
    tray = await ensureTray({
      onOpenLibrary: openLibrary,
      onOpenSettings: async () => {
        await openLibrary();
        mainWindow?.webContents.send(IPC.nav, "/settings");
      },
    });
  } catch (err) {
    log.error(
      "[pond] failed to create tray; menu-bar icon will be unavailable",
      err,
    );
  }
  registerSyncActionListener(() => queueTrayRefresh());

  // Apply the persisted Quick Capture prefs (tray visibility,
  // launch-at-login, hotkey accelerator). Cheap — just a couple of
  // platform calls and a single getPrefs lookup.
  void applyPrefsAtRuntime().catch((err) =>
    log.warn("[pond] applyPrefsAtRuntime failed", err),
  );

  // Broadcast auto-video queue snapshots to every renderer. Subscribing
  // here (rather than from the renderer) means the queue still ticks
  // even when no window is open — when the user later opens the
  // library, the next change push will catch them up.
  subscribeToAutoVideoStatus(broadcastAutoVideoStatus);
  subscribeToSyncStatus(broadcastSyncStatus);

  // First-run pairing flow: if the window never opened once we still want
  // the user to find the token, so show the window if the app launched
  // un-hidden. If the user set "Launch as Hidden" we rely on the tray.
  const loginItem = app.getLoginItemSettings();
  const launchedHidden =
    loginItem.wasOpenedAsHidden ?? loginItem.wasOpenedAtLogin ?? false;
  if (!launchedHidden) {
    mainWindow = await createWindow();
  }

  app.on("activate", async () => {
    if (process.platform === "darwin") app.dock?.show();
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

/**
 * Hourly sweep that purges trash older than the user-configured
 * window. Cheap when disabled — `getPrefs()` returns the cached
 * default of `null`, which `emptyTrashOlderThan` is a no-op for.
 */
function registerTrashCron() {
  const tick = async () => {
    try {
      const prefs = await getPrefs();
      const days = prefs.trash.autoEmptyDays;
      if (days === null) return;
      const purged = await emptyTrashOlderThan(days);
      if (purged > 0) {
        log.info(
          `[pond trash-cron] purged ${purged} items older than ${days}d`,
        );
      }
    } catch (err) {
      log.warn("[pond trash-cron] failed", err);
    }
  };
  // Run once at startup, then every hour. The interval handle is
  // intentionally not stored — `before-quit` doesn't need to clear
  // it because the process is exiting.
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), 60 * 60 * 1000);
}

/**
 * Per-source background-sync scheduler. Each enabled source maintains
 * its own interval based on `prefs.sync[source].cadence`; the cadence
 * is read on every tick so a renderer-side change takes effect on the
 * next slice without needing a re-register.
 *
 * Conservative defaults: nothing fires on launch unless the user has
 * explicitly opted in. For Twitter we additionally seed a default
 * `enabled: true, cadence: "hourly"` *only* once we detect an
 * authenticated cookie session — kicking off scrapes against a
 * logged-out browser would just churn auth-wall errors.
 *
 * The cron uses one master timer (60s) and walks the per-source
 * map; cheap, and avoids leaking a setInterval per source.
 */
function registerSyncCron() {
  const lastFire = new Map<string, number>();

  function intervalForCadence(cadence: string): number | null {
    switch (cadence) {
      case "15min":
        return 15 * 60 * 1000;
      case "hourly":
        return 60 * 60 * 1000;
      case "6h":
        return 6 * 60 * 60 * 1000;
      case "daily":
        return 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  // First-launch seeding: if Twitter has no `prefs.sync.twitter`
  // bucket yet but the cookie partition shows an authenticated
  // session, default it to hourly so the user gets background sync
  // without having to flip a switch. Disconnected accounts stay at
  // the schema default (`enabled: false`).
  async function maybeSeedTwitter(): Promise<void> {
    try {
      const prefs = await getPrefs();
      if (prefs.sync.twitter) return;
      const connected = await isSourceConnected("twitter");
      if (!connected) return;
      await patchSourceSync("twitter", {
        enabled: true,
        cadence: "hourly",
      });
      log.info("[pond sync-cron] seeded Twitter default cadence (hourly)");
    } catch (err) {
      log.warn("[pond sync-cron] seed check failed", err);
    }
  }

  const tick = async () => {
    try {
      const prefs = await getPrefs();
      const now = Date.now();
      for (const [src, cfg] of Object.entries(prefs.sync)) {
        if (!cfg?.enabled) continue;
        const interval = intervalForCadence(cfg.cadence);
        if (interval === null) continue;
        const last = lastFire.get(src);
        if (last !== undefined && now - last < interval) continue;
        lastFire.set(src, now);
        // We don't await — `syncSource` runs to completion in the
        // background and emits status events. Awaiting would block
        // the next source from kicking off if it were due at the
        // same minute.
        void syncSource(src as Parameters<typeof syncSource>[0], {
          trigger: "cron",
        });
      }
    } catch (err) {
      log.warn("[pond sync-cron] tick failed", err);
    }
  };

  // Delay the first tick so the renderer / DB / hidden window are all
  // up before we possibly nav the hidden window to a bookmarks list.
  setTimeout(() => {
    void maybeSeedTwitter();
    void tick();
  }, 60_000);
  setInterval(() => void tick(), 60 * 1000);
}

/**
 * Build the application menu so macOS shows the standard
 * `Preferences…` (`⌘,`) item under the app menu. Also wires the same
 * accelerator on Windows/Linux via an Edit > Preferences entry.
 *
 * Most items delegate to Electron's built-in roles so cut/copy/paste,
 * window controls, and DevTools work without bespoke handlers. The
 * only custom action is the Preferences item, which navigates the
 * focused renderer to `/settings`.
 */
function installAppMenu() {
  const isMac = process.platform === "darwin";
  const openPreferences = () => {
    const target = mainWindow ?? BrowserWindow.getFocusedWindow();
    if (!target || target.isDestroyed()) return;
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    target.webContents.send(IPC.nav, "/settings");
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Preferences…",
                accelerator: "Command+,",
                click: openPreferences,
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
        ...(!isMac
          ? [
              { type: "separator" as const },
              {
                label: "Preferences…",
                accelerator: "Control+,",
                click: openPreferences,
              },
            ]
          : []),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerUndoHotkeys() {
  const undoAccel = process.platform === "darwin" ? "Command+Z" : "Control+Z";
  const redoAccel =
    process.platform === "darwin" ? "Command+Shift+Z" : "Control+Shift+Z";
  globalShortcut.register(undoAccel, async () => {
    if (!BrowserWindow.getFocusedWindow()) return;
    if (!canUndo()) return;
    await undo();
  });
  globalShortcut.register(redoAccel, async () => {
    if (!BrowserWindow.getFocusedWindow()) return;
    if (!canRedo()) return;
    await redo();
  });
}

/**
 * Cmd+Shift+L pops the library from anywhere (system-wide). Eagle uses
 * Cmd+Shift+E but we pick `L` for "Library" to avoid stomping Eagle
 * when both are installed.
 *
 * The quick-capture accelerator is user-configurable through Settings
 * → Quick capture. We store the currently registered string so we can
 * unregister cleanly when the user picks a new one without leaking
 * accelerators across re-registers.
 */
let registeredCaptureAccel: string | null = null;

async function summonMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = await createWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function registerQuickSaveHotkey() {
  const isMac = process.platform === "darwin";
  const summonAccel = isMac ? "Command+Shift+L" : "Control+Shift+L";
  const ok1 = globalShortcut.register(summonAccel, summonMainWindow);
  if (!ok1) log.warn(`[pond] summon hotkey ${summonAccel} not registered`);

  // Capture hotkey starts with whatever the prefs say. We don't fail
  // hard if the OS rejects it — the user can pick another accelerator
  // from settings.
  void registerCaptureHotkeyFromPrefs();
}

export async function registerCaptureHotkeyFromPrefs() {
  invalidatePrefs();
  const prefs = await getPrefs();
  const accel = prefs.quickCapture.hotkey || "CommandOrControl+Shift+S";
  if (registeredCaptureAccel && registeredCaptureAccel !== accel) {
    try {
      globalShortcut.unregister(registeredCaptureAccel);
    } catch {
      /* unregister failures are non-fatal */
    }
  }
  if (registeredCaptureAccel === accel) return;
  const ok = globalShortcut.register(accel, async () => {
    await summonMainWindow();
    mainWindow?.webContents.send(IPC.nav, "/?capture=1");
  });
  if (!ok) {
    log.warn(`[pond] quick-capture hotkey ${accel} not registered`);
    registeredCaptureAccel = null;
    return;
  }
  registeredCaptureAccel = accel;
}

/**
 * Apply prefs.quickCapture and prefs.security to the main process at
 * boot. Centralised so prefs writes from the renderer can trigger the
 * same wiring through `applyPrefsAtRuntime`.
 */
export async function applyPrefsAtRuntime() {
  invalidatePrefs();
  const prefs = await getPrefs();
  await setTrayVisible(prefs.quickCapture.menuBarIcon);
  app.setLoginItemSettings({
    openAtLogin: prefs.quickCapture.launchAtLogin,
    openAsHidden: true,
  });
  await registerCaptureHotkeyFromPrefs();
}

/**
 * Tear down the HTTP server and re-bind it with the freshly read
 * port + bind address. Called after `prefs.api.*` flips. Cheap —
 * Hono restart is essentially `close()` + new `listen()`.
 */
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

// Close = minimize to tray. Eagle does the same thing. On macOS we
// also hide the dock so the user doesn't see the bouncing icon when
// the window is not visible.
app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    app.dock?.hide();
    return;
  }
  // Windows / Linux: no tray icon keeps us alive reliably on exit, so
  // closing the window also terminates the process. Power users who
  // want background behaviour can pin pond to the tray.
  // On tray-supported platforms you may want to comment this out.
  app.quit();
});

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  try {
    disposeHiddenWindow();
  } catch (err) {
    log.warn("[pond] hidden window dispose failed", err);
  }
  try {
    await httpServer?.close();
  } catch (err) {
    log.warn("[pond] http server close failed", err);
  }
});
