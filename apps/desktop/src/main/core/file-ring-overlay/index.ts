import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  screen,
} from "electron";
import type { FileRingOverlaySnapshot } from "../../../shared/file-ring-overlay-contracts";
import { lockRendererZoom } from "../../lib/lock-renderer-zoom";
import { resolveMainOut, resolvePreload } from "../../lib/resolve-preload";
import { areaCenter, overlayBehavior, overlayBounds } from "./placement";

let overlay: BrowserWindow | null = null;
let snapshot: FileRingOverlaySnapshot | null = null;

export function fileRingOverlayOwnsSender(id: number): boolean {
  return Boolean(
    overlay && !overlay.isDestroyed() && overlay.webContents.id === id,
  );
}

export function fileRingOverlaySnapshot(): FileRingOverlaySnapshot | null {
  return snapshot;
}

export function isFileRingOverlayOpen(): boolean {
  return overlay !== null;
}

export function closeFileRingOverlay(): void {
  const win = overlay;
  overlay = null;
  snapshot = null;
  if (win && !win.isDestroyed()) win.close();
}

function placement() {
  const behavior = overlayBehavior(
    process.platform,
    process.env.XDG_SESSION_TYPE,
  );
  const pointer = behavior.atPointer
    ? screen.getCursorScreenPoint()
    : areaCenter(screen.getPrimaryDisplay().workArea);
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  return { behavior, bounds: overlayBounds(pointer, workAreas) };
}

/** A fresh window per open, because a hidden one would keep Pond running after its last real window closes. */
export async function openFileRingOverlay(
  next: FileRingOverlaySnapshot,
): Promise<void> {
  closeFileRingOverlay();
  const { behavior, bounds } = placement();
  if (!bounds) return;
  const options: BrowserWindowConstructorOptions = {
    ...bounds,
    title: "File To",
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: resolvePreload("file-ring.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  };
  if (behavior.panel) options.type = "panel";
  const win = new BrowserWindow(options);
  overlay = win;
  snapshot = next;
  lockRendererZoom(win.webContents);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.setAlwaysOnTop(true, "pop-up-menu");
  /** Skipping the process type change keeps the Dock icon from blinking each time the ring opens. */
  if (behavior.allWorkspaces)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  win.on("blur", () => {
    if (overlay === win) closeFileRingOverlay();
  });
  win.once("closed", () => {
    if (overlay !== win) return;
    overlay = null;
    snapshot = null;
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  try {
    if (devUrl)
      await win.loadURL(new URL("file-ring.html", `${devUrl}/`).toString());
    else await win.loadFile(resolveMainOut("../renderer/file-ring.html"));
  } catch (error) {
    if (!win.isDestroyed()) win.destroy();
    throw error;
  }
}

/** Shown only after the renderer paints the ring, so it never flashes an empty window. */
export function presentFileRingOverlay(): void {
  const win = overlay;
  if (!win || win.isDestroyed() || win.isVisible()) return;
  win.showInactive();
  win.focus();
}
