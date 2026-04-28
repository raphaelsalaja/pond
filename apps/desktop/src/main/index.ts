import { join } from "node:path";
import { app, BrowserWindow, globalShortcut, shell } from "electron";
import log from "electron-log/main.js";
import { DEFAULT_INGEST_PORT, IPC } from "../shared/constants";
import {
  type AutoVideoStatus,
  autoVideoQueueSnapshot,
  subscribeToAutoVideoStatus,
} from "./core/auto-video";
import {
  registerSyncActionListener,
  replayPendingTransactions,
} from "./core/executor";
import { disposeHiddenWindow } from "./core/refresh/scrape-window";
import { reconcileLibrary } from "./core/scan";
import { canRedo, canUndo, redo, undo } from "./core/undo";
import { getDb } from "./db";
import { type RunningServer, startHttpServer } from "./http/server";
import { registerIpc } from "./ipc";
import { ensureIngestToken } from "./keychain";
import { resolvePaths } from "./paths";
import { registerProtocol, registerScheme } from "./protocol";
import { ensureTray, type TrayHandle } from "./tray";
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

  await ensureIngestToken();
  registerProtocol();
  registerIpc();

  try {
    await getDb();
    await replayPendingTransactions();
    // Run the library reconcile in the background so the first window
    // frame isn't blocked on disk scanning.
    void reconcileLibrary().catch((err) => log.warn("[pond] scan failed", err));
  } catch (err) {
    log.error("[pond] db init failed", err);
  }

  try {
    httpServer = await startHttpServer(DEFAULT_INGEST_PORT);
  } catch (err) {
    log.error("[pond] http server failed to start", err);
  }

  registerUndoHotkeys();
  registerQuickSaveHotkey();
  registerAutoUpdater();

  const openLibrary = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = await createWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  try {
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

  // Broadcast auto-video queue snapshots to every renderer. Subscribing
  // here (rather than from the renderer) means the queue still ticks
  // even when no window is open — when the user later opens the
  // library, the next change push will catch them up.
  subscribeToAutoVideoStatus(broadcastAutoVideoStatus);

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
 */
function registerQuickSaveHotkey() {
  const accel =
    process.platform === "darwin" ? "Command+Shift+L" : "Control+Shift+L";
  const ok = globalShortcut.register(accel, async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = await createWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  if (!ok) {
    log.warn(`[pond] quick-save hotkey ${accel} not registered`);
  }
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
