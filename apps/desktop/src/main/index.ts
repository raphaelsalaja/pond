import { join, resolve as resolvePath } from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  session,
  shell,
} from "electron";
import log from "electron-log/main.js";
import { DEFAULT_INGEST_PORT, IPC } from "../shared/constants";
import {
  type AutoVideoStatus,
  autoVideoQueueSnapshot,
  subscribeToAutoVideoStatus,
} from "./core/auto-video";
import { startBackupCron } from "./core/backups";
import { enqueueBackfill, startEnrichWorker } from "./core/enrich";
import {
  registerSyncActionListener,
  replayPendingTransactions,
} from "./core/executor";
import { emptyTrashOlderThan } from "./core/library-ops";
import { getPrefs, invalidatePrefs } from "./core/prefs";
import { isSourceConnected } from "./core/refresh";
import {
  type RefreshBackfillStatus,
  subscribeRefreshBackfillStatus,
} from "./core/refresh/backfill";
import { disposeHiddenWindow } from "./core/refresh/scrape-window";
import { reconcileLibrary } from "./core/scan";
import {
  startStorageWatcher,
  stopStorageWatcher,
} from "./core/storage-watcher";
import {
  patchSourceSync,
  type SyncStatusUpdate,
  subscribeToSyncStatus,
  syncSource,
} from "./core/sync";
import { migrateTwitterRawShape } from "./core/sync/migrate-twitter-raw";
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
 * Push every refresh-backfill orchestrator status event to every live
 * renderer. Same shape as `broadcastSyncStatus`: subscribe in main
 * once at startup so the events keep flowing whether or not a window
 * is open. The Settings → Storage progress bar reads from this stream.
 */
function broadcastRefreshBackfillStatus(status: RefreshBackfillStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.refreshBackfillStatus, status);
    }
  }
}

/**
 * `pond` is a menu-bar / background app first. Register the protocol
 * scheme before `ready`; everything else runs after.
 */
registerScheme();

/**
 * Single-instance lock. Without this, two instances would clash on
 * the fixed HTTP port, the global hotkey, and the tray; deep-link
 * launches on Windows/Linux would silently spawn a second process
 * that immediately exits. Must run before `app.whenReady`.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/**
 * Register `pond://` as a system-wide protocol so URLs the
 * Integrations settings page documents (`pond://item/<id>`,
 * `pond://search?q=…`, `pond://capture?url=…`, `pond://pair?…`)
 * actually open the app when invoked from Raycast / Apple Shortcuts /
 * Slack. Run at module load so the OS sees us before the first
 * `whenReady` tick.
 */
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("pond", process.execPath, [
      resolvePath(process.argv[1] ?? ""),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("pond");
}

/**
 * Deep-link handler. Routes `pond://…` URLs to the renderer via the
 * existing `IPC.nav` channel. Each branch maps a documented URL shape
 * to the in-app route the renderer already knows how to render.
 *
 *   pond://item/<id>            → /save/<id>
 *   pond://search?q=<query>     → /search?q=<query>
 *   pond://capture?url=<url>    → /quick-capture?url=<url>
 *   pond://pair?token=<token>   → /settings/api?token=<token>
 *
 * Unknown shapes fall through to a no-op so a malformed link from a
 * third-party tool doesn't crash anything. Logged at info so the user
 * can debug from the log file.
 */
let pendingDeepLink: string | null = null;
function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "pond:") return;
    let route: string | null = null;
    if (parsed.hostname === "item") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) route = `/save/${encodeURIComponent(id)}`;
    } else if (parsed.hostname === "search") {
      const q = parsed.searchParams.get("q") ?? "";
      route = `/search?q=${encodeURIComponent(q)}`;
    } else if (parsed.hostname === "capture") {
      const target = parsed.searchParams.get("url") ?? "";
      route = `/quick-capture?url=${encodeURIComponent(target)}`;
    } else if (parsed.hostname === "pair") {
      const token = parsed.searchParams.get("token") ?? "";
      route = `/settings/api${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    }
    if (!route) {
      log.info("[pond deep-link] ignored", url);
      return;
    }
    log.info("[pond deep-link] route", route);
    const target =
      mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : (BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null);
    if (!target) {
      // Window not up yet (cold-launch via deep link). Stash the
      // route and replay it once `createWindow` finishes.
      pendingDeepLink = route;
      return;
    }
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    target.webContents.send(IPC.nav, route);
  } catch (err) {
    log.warn("[pond deep-link] parse failed", url, err);
  }
}

// macOS: deep-link launches arrive here.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows / Linux: deep-link launches start a second process, which
// the single-instance lock kills. The killed process's argv arrives
// here on the running instance.
app.on("second-instance", (_event, argv) => {
  const url = argv.find((a) => a.startsWith("pond://"));
  if (url) handleDeepLink(url);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/**
 * Lock down session-level defaults that Electron leaves open.
 *
 * 1. Permission requests: deny everything by default. The hidden
 *    scrape window navigates to arbitrary user-saved URLs and to
 *    social-login pages — Chromium's default is to *prompt*, which
 *    blocks an offscreen window forever. The main renderer is our
 *    own code; if it ever needs a permission we'll opt into it
 *    explicitly here.
 *
 * 2. Production CSP: the renderer's `<meta http-equiv="CSP">` allows
 *    `'unsafe-eval'` because Vite dev's HMR needs it. We strip
 *    `'unsafe-eval'` and narrow `connect-src` for packaged builds
 *    by injecting a tighter `Content-Security-Policy` header on
 *    every renderer response.
 */
function configureSessionDefaults(): void {
  const denyAll: Parameters<
    Electron.Session["setPermissionRequestHandler"]
  >[0] = (_wc, _permission, callback) => callback(false);
  session.defaultSession.setPermissionRequestHandler(denyAll);
  try {
    session
      .fromPartition("persist:pond-scrapers")
      .setPermissionRequestHandler(denyAll);
  } catch (err) {
    log.warn("[pond] scrapers session permission handler failed", err);
  }

  if (app.isPackaged) {
    const PROD_CSP = [
      "default-src 'self' pond:",
      "img-src 'self' data: blob: pond: https:",
      "media-src 'self' data: blob: pond: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self' http://127.0.0.1:* pond: https:",
      "font-src 'self' data:",
      "frame-src https://www.youtube-nocookie.com",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; ");
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      const headers = { ...(details.responseHeaders ?? {}) };
      // Strip any inherited CSP so ours is canonical.
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "content-security-policy") {
          delete headers[key];
        }
      }
      headers["Content-Security-Policy"] = [PROD_CSP];
      cb({ responseHeaders: headers });
    });
  }
}

async function createWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 16, y: 24 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    // Replay a deep link that arrived before any window was up
    // (cold-launch via `open-url` on macOS).
    if (pendingDeepLink) {
      const route = pendingDeepLink;
      pendingDeepLink = null;
      win.webContents.send(IPC.nav, route);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;

  // Block any in-window navigation away from the trusted renderer
  // origin. A renderer that's tricked into `window.location = "https://
  // attacker.com/"` (XSS, malicious save metadata, dropped HTML file)
  // would otherwise navigate the chrome of the trusted window and
  // inherit the preload context. Foreign URLs get bounced to the
  // user's default browser instead, matching the windowOpenHandler
  // policy above.
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = (() => {
      if (devUrl && url.startsWith(devUrl)) return true;
      if (url.startsWith("file://")) return true;
      if (url.startsWith("pond://")) return true;
      // about:blank fires here on first paint of some embeddings;
      // harmless and we never load it ourselves.
      if (url === "about:blank") return true;
      return false;
    })();
    if (!allowed) {
      event.preventDefault();
      log.warn("[pond] blocked navigation away from trusted origin", url);
      const u = (() => {
        try {
          return new URL(url);
        } catch {
          return null;
        }
      })();
      if (u && (u.protocol === "http:" || u.protocol === "https:")) {
        void shell.openExternal(u.toString());
      }
    }
  });
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

  configureSessionDefaults();

  await ensureIngestToken();
  registerProtocol();
  registerIpc();

  try {
    await getDb();
    await replayPendingTransactions();
    // One-shot data migration: rows imported by older twitter
    // sync builds had `raw.twitter` set to the verbatim API tweet, so
    // metric chips never rendered. Cheap idempotent walk; bails after
    // the first run via an in-process flag.
    void migrateTwitterRawShape().catch((err) =>
      log.warn("[pond] twitter raw migration failed", err),
    );
    // Run the library reconcile in the background so the first window
    // frame isn't blocked on disk scanning.
    void reconcileLibrary().catch((err) => log.warn("[pond] scan failed", err));
    // Background AI enrichment worker. Idempotent if already running;
    // does nothing useful when AI provider is `off` except for the
    // always-local colour extraction job.
    startEnrichWorker();
    // One-shot enrich backfill so libraries created before a new
    // always-local field landed (currently `blur_data_url`) pick the
    // value up without an explicit user action. Gated by `pond_meta`
    // so we walk the rows once per schema version, not every launch.
    void backfillEnrichOnce().catch((err) =>
      log.warn("[pond] enrich backfill failed", err),
    );
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

  registerSummonHotkey();
  registerAutoUpdater();
  registerTrashCron();
  registerSyncCron();
  startBackupCron();
  void startStorageWatcher().catch((err) =>
    log.warn("[pond] storage watcher failed to start", err),
  );
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
  subscribeRefreshBackfillStatus(broadcastRefreshBackfillStatus);

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
        // Custom Undo / Redo. We deliberately avoid `role: "undo"` /
        // `role: "redo"` because pond has its own transactional undo
        // stack (see `core/undo.ts`) on top of native text-input undo.
        // The click handler fires native input undo first (so typing
        // in a text field behaves normally) and then asks the renderer
        // to run pond undo iff focus is outside an editable element.
        // Menu accelerators only fire when the app is focused, so
        // Cmd+Z no longer leaks into VSCode / other apps the way it
        // did when this was registered via `globalShortcut`.
        {
          label: "Undo",
          accelerator: "CommandOrControl+Z",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win || win.isDestroyed()) return;
            win.webContents.undo();
            win.webContents.send(IPC.editUndoRequested);
          },
        },
        {
          label: "Redo",
          accelerator: isMac ? "Command+Shift+Z" : "Control+Y",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win || win.isDestroyed()) return;
            win.webContents.redo();
            win.webContents.send(IPC.editRedoRequested);
          },
        },
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
        // Reload + DevTools belong to dev only. In production they
        // expose the running renderer to anyone with momentary
        // physical access; not worth the convenience for the
        // handful of users who'd actually want to debug a packaged
        // build (those can launch with POND_OPEN_DEVTOOLS=1).
        ...(!app.isPackaged
          ? [
              { role: "reload" as const },
              { role: "forceReload" as const },
              { role: "toggleDevTools" as const },
              { type: "separator" as const },
            ]
          : []),
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

/**
 * Cmd+Shift+L pops the library from anywhere (system-wide). Eagle uses
 * Cmd+Shift+E but we pick `L` for "Library" to avoid stomping Eagle
 * when both are installed.
 */
async function summonMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = await createWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function registerSummonHotkey() {
  const isMac = process.platform === "darwin";
  const summonAccel = isMac ? "Command+Shift+L" : "Control+Shift+L";
  const ok = globalShortcut.register(summonAccel, summonMainWindow);
  if (!ok) log.warn(`[pond] summon hotkey ${summonAccel} not registered`);
}

/**
 * Walk every active save and re-enqueue any always-local enrichment
 * job whose output column is still null. Used to backfill a new
 * column (most recently `blur_data_url`) into libraries that finished
 * their initial enrichment pass before the column existed.
 *
 * Gated by a `pond_meta` sentinel so we don't pay the row scan on
 * every launch — bumping the version below re-runs the walk once.
 */
const ENRICH_BACKFILL_VERSION = "3";
async function backfillEnrichOnce(): Promise<void> {
  const db = await getDb();
  const raw = db.$raw;
  raw.exec(
    `CREATE TABLE IF NOT EXISTS pond_meta (key TEXT PRIMARY KEY, value TEXT)`,
  );
  const row = raw
    .prepare(`SELECT value FROM pond_meta WHERE key = 'enrich_backfill'`)
    .get() as { value: string } | undefined;
  if (row?.value === ENRICH_BACKFILL_VERSION) return;
  const result = await enqueueBackfill();
  if (result.scheduled > 0) {
    log.info("[pond] enrich backfill queued", result.scheduled, "jobs");
  }
  raw
    .prepare(
      `INSERT INTO pond_meta(key, value) VALUES('enrich_backfill', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(ENRICH_BACKFILL_VERSION);
}

/**
 * Apply prefs.quickCapture to the main process at boot. Centralised
 * so prefs writes from the renderer can trigger the same wiring
 * through `applyPrefsAtRuntime`.
 */
export async function applyPrefsAtRuntime() {
  invalidatePrefs();
  const prefs = await getPrefs();
  await setTrayVisible(prefs.quickCapture.menuBarIcon);
  app.setLoginItemSettings({
    openAtLogin: prefs.quickCapture.launchAtLogin,
    openAsHidden: true,
  });
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
  // Windows / Linux: only quit when the tray isn't running. With the
  // tray alive (the user enabled "Show menu-bar icon" or the default
  // first-run pref), closing the last window keeps the background
  // process up so the global hotkey, sync cron, and HTTP server keep
  // ticking — matching the behaviour the launch-at-login + open-as-
  // hidden flow promises.
  if (tray) return;
  app.quit();
});

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  try {
    stopStorageWatcher();
  } catch (err) {
    log.warn("[pond] storage watcher stop failed", err);
  }
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
