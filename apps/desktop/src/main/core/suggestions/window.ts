import { join } from "node:path";
import { BrowserWindow, screen } from "electron";
import log from "electron-log/main.js";

const WIDTH = 540;
const HEIGHT = 280;
const SCREEN_MARGIN = 16;

let win: BrowserWindow | null = null;

function reposition(target: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const x = Math.round(workArea.x + workArea.width - WIDTH - SCREEN_MARGIN);
  const y = Math.round(workArea.y + workArea.height - HEIGHT - SCREEN_MARGIN);
  target.setBounds({ x, y, width: WIDTH, height: HEIGHT });
}

export function getOrCreateSuggestionWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;

  const created = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    type: process.platform === "darwin" ? "panel" : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  reposition(created);
  created.setAlwaysOnTop(true, "floating");
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const target = devUrl ? `${devUrl.replace(/\/$/, "")}/suggestion.html` : null;
  if (target) {
    void created
      .loadURL(target)
      .catch((err) =>
        log.warn("[pond suggestion-window] dev load failed", err),
      );
  } else {
    void created
      .loadFile(join(__dirname, "../renderer/suggestion.html"))
      .catch((err) =>
        log.warn("[pond suggestion-window] file load failed", err),
      );
  }

  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  created.on("closed", () => {
    if (win === created) win = null;
  });

  win = created;
  return created;
}

export function showSuggestionWindow(): void {
  const w = getOrCreateSuggestionWindow();
  reposition(w);
  if (w.isVisible()) {
    w.focus();
    return;
  }
  w.show();
  w.focus();
}

export function hideSuggestionWindow(): void {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
}

export function getSuggestionWindow(): BrowserWindow | null {
  if (!win || win.isDestroyed()) return null;
  return win;
}

export function destroySuggestionWindow(): void {
  if (!win || win.isDestroyed()) {
    win = null;
    return;
  }
  win.destroy();
  win = null;
}
