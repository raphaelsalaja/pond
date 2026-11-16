import { BrowserWindow, ipcMain, nativeTheme, screen } from "electron";
import {
  MISSING_LIBRARY_WINDOW_IPC,
  type MissingLibraryChoice,
  MissingLibraryChoiceSchema,
  type MissingLibraryView,
} from "../shared/missing-library-contracts";
import { safeHandle } from "./ipc/helpers";
import { lockRendererZoom } from "./lib/lock-renderer-zoom";
import { resolveMainOut, resolvePreload } from "./lib/resolve-preload";

const WIDTH = 760;
const HEIGHT = 620;

let current: BrowserWindow | null = null;

export interface MissingLibraryWindow {
  ask(detail: string): Promise<MissingLibraryChoice>;
  /** Sheets attach here so pickers stay on top of the recovery page. */
  window(): BrowserWindow | null;
  /** Hides instead of closing so `window-all-closed` can't quit before the Library window exists. */
  settle(): void;
}

export function openMissingLibraryWindow(
  name: string,
  path: string,
): MissingLibraryWindow {
  let view: MissingLibraryView = { name, path, detail: "", attempt: 0 };
  let pending: ((choice: MissingLibraryChoice) => void) | null = null;
  let delivered = false;
  let win: BrowserWindow | null = null;

  const answer = (choice: MissingLibraryChoice) => {
    const resolve = pending;
    pending = null;
    resolve?.(choice);
  };

  const owns = (id: number) => win !== null && win.webContents.id === id;

  const create = () => {
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    const width = Math.min(WIDTH, display.width);
    const height = Math.min(HEIGHT, display.height);
    const isMac = process.platform === "darwin";
    const next = new BrowserWindow({
      title: "Library not found",
      width,
      height,
      x: display.x + Math.round((display.width - width) / 2),
      y: display.y + Math.round((display.height - height) / 2),
      resizable: false,
      fullscreenable: false,
      maximizable: false,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      trafficLightPosition: isMac ? { x: 16, y: 15 } : undefined,
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#000000" : "#ffffff",
      webPreferences: {
        preload: resolvePreload("missing-library.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    current = next;
    lockRendererZoom(next.webContents);
    next.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    next.webContents.on("will-navigate", (event) => event.preventDefault());
    next.once("ready-to-show", () => {
      next.show();
      next.focus();
    });
    next.once("closed", () => {
      ipcMain.removeHandler(MISSING_LIBRARY_WINDOW_IPC.ready);
      ipcMain.removeHandler(MISSING_LIBRARY_WINDOW_IPC.choose);
      if (current === next) current = null;
      win = null;
      answer("quit");
    });

    safeHandle(MISSING_LIBRARY_WINDOW_IPC.ready, (event) => {
      if (!owns(event.sender.id)) throw new Error("Not the recovery window");
      delivered = true;
      return view;
    });
    safeHandle(MISSING_LIBRARY_WINDOW_IPC.choose, (event, raw) => {
      if (!owns(event.sender.id)) throw new Error("Not the recovery window");
      const choice = MissingLibraryChoiceSchema.safeParse(raw);
      if (choice.success) answer(choice.data);
    });

    const devUrl = process.env.ELECTRON_RENDERER_URL;
    void (
      devUrl
        ? next.loadURL(new URL("missing-library.html", `${devUrl}/`).toString())
        : next.loadFile(resolveMainOut("../renderer/missing-library.html"))
    ).catch(() => {
      if (!next.isDestroyed()) next.destroy();
    });
    return next;
  };

  return {
    ask(detail) {
      view = { ...view, detail, attempt: view.attempt + 1 };
      if (!win) {
        if (view.attempt > 1) return Promise.resolve("quit");
        win = create();
      } else {
        if (delivered)
          win.webContents.send(MISSING_LIBRARY_WINDOW_IPC.view, view);
        win.show();
        win.focus();
      }
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    window: () => win,
    settle() {
      win?.hide();
    },
  };
}

export function closeMissingLibraryWindow(): void {
  if (current && !current.isDestroyed()) current.destroy();
  current = null;
}
