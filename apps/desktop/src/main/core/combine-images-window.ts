import { BrowserWindow, nativeTheme, screen } from "electron";
import {
  COMBINE_IMAGES_WINDOW_IPC,
  CombineImagesDropSchema,
  CombineImagesWindowOpenSchema,
  isCombineImagesZoomAction,
} from "../../shared/combine-images-contracts";
import type {
  CombineImagesWindowLoad,
  CombineImagesWindowOpen,
} from "../../shared/combine-images-contracts";
import { attachEditableContextMenu } from "../context-menu";
import { safeHandle } from "../ipc/helpers";
import {
  detachedWindowChrome,
  detachedWindowTitle,
} from "../lib/detached-window-chrome";
import { followInterfaceZoom } from "../lib/follow-interface-zoom";
import { lockRendererZoom } from "../lib/lock-renderer-zoom";
import { resolveMainOut, resolvePreload } from "../lib/resolve-preload";
import { getPrefs, subscribePrefs } from "./prefs";
import { resolveSaveDrop } from "./save-drag-session";

let combineWindow: BrowserWindow | null = null;
let opening: Promise<void> | null = null;
let delivered = false;
let load: CombineImagesWindowLoad = { ids: [], folderId: null, nonce: 0 };

export function combineImagesWindowOwnsSender(id: number): boolean {
  return combineWindow?.webContents.id === id;
}

async function openCombineImagesWindow(
  next: CombineImagesWindowOpen,
): Promise<void> {
  load = { ...next, nonce: load.nonce + 1 };
  if (opening) {
    await opening;
  }
  if (combineWindow && !combineWindow.isDestroyed()) {
    if (combineWindow.isMinimized()) {
      combineWindow.restore();
    }
    if (delivered) {
      combineWindow.webContents.send(COMBINE_IMAGES_WINDOW_IPC.load, load);
    }
    combineWindow.show();
    combineWindow.focus();
    return;
  }
  delivered = false;
  opening = createCombineImagesWindow().finally(() => {
    opening = null;
  });
  await opening;
}

/** App menu zoom accelerators would otherwise focus the Library and zoom its grid. */
export function routeCombineImagesZoom(id: string): boolean {
  const focused = BrowserWindow.getFocusedWindow();
  if (!focused || focused !== combineWindow || !isCombineImagesZoomAction(id)) {
    return false;
  }
  focused.webContents.send(COMBINE_IMAGES_WINDOW_IPC.zoom, id);
  return true;
}

export function closeCombineImagesWindow(): void {
  if (combineWindow && !combineWindow.isDestroyed()) {
    combineWindow.close();
  }
}

async function createCombineImagesWindow(): Promise<void> {
  const display = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const width = Math.min(1080, display.width);
  const height = Math.min(720, display.height);
  const win = new BrowserWindow({
    ...detachedWindowChrome(),
    title: detachedWindowTitle("Combine Images"),
    width,
    height,
    x: display.x + Math.round((display.width - width) / 2),
    y: display.y + Math.round((display.height - height) / 2),
    minWidth: Math.min(860, width),
    minHeight: Math.min(560, height),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#000000" : "#ffffff",
    webPreferences: {
      preload: resolvePreload("combine-images.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  combineWindow = win;
  lockRendererZoom(win.webContents);
  followInterfaceZoom(win.webContents, { getPrefs, subscribePrefs });
  attachEditableContextMenu(win.webContents);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.once("closed", () => {
    if (combineWindow !== win) {
      return;
    }
    combineWindow = null;
    delivered = false;
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  try {
    if (devUrl) {
      await win.loadURL(
        new URL("combine-images.html", `${devUrl}/`).toString(),
      );
    } else {
      await win.loadFile(resolveMainOut("../renderer/combine-images.html"));
    }
  } catch (error) {
    win.destroy();
    throw error;
  }
}

function assertOwner(id: number): void {
  if (!combineImagesWindowOwnsSender(id)) {
    throw new Error("Not a Combine Images window");
  }
}

export function registerCombineImagesWindowIpc(): void {
  safeHandle(
    COMBINE_IMAGES_WINDOW_IPC.open,
    async (_event, input: CombineImagesWindowOpen) => {
      await openCombineImagesWindow(CombineImagesWindowOpenSchema.parse(input));
    },
  );
  safeHandle(COMBINE_IMAGES_WINDOW_IPC.ready, (event) => {
    assertOwner(event.sender.id);
    delivered = true;
    return load;
  });
  safeHandle(
    COMBINE_IMAGES_WINDOW_IPC.resolveDrop,
    (event, paths: ReadonlyArray<string>) => {
      assertOwner(event.sender.id);
      return resolveSaveDrop(CombineImagesDropSchema.parse(paths));
    },
  );
  safeHandle(COMBINE_IMAGES_WINDOW_IPC.close, (event) => {
    assertOwner(event.sender.id);
    combineWindow?.close();
  });
}
