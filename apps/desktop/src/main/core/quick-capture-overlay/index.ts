import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  screen,
} from "electron";
import type { QuickCaptureSnapshot } from "../../../shared/quick-capture-contracts";
import { lockRendererZoom } from "../../lib/lock-renderer-zoom";
import { resolveMainOut, resolvePreload } from "../../lib/resolve-preload";
import { overlayBehavior } from "../file-ring-overlay/placement";

const WIDTH = 560;
const HEIGHT = 420;

let overlay: BrowserWindow | null = null;
let snapshot: QuickCaptureSnapshot | null = null;
let picking = false;

export function quickCaptureOwnsSender(id: number): boolean {
  return Boolean(
    overlay && !overlay.isDestroyed() && overlay.webContents.id === id,
  );
}

export function quickCaptureSnapshot(): QuickCaptureSnapshot | null {
  return snapshot;
}

export function quickCaptureWindow(): BrowserWindow | null {
  return overlay && !overlay.isDestroyed() ? overlay : null;
}

export function isQuickCaptureOpen(): boolean {
  return overlay !== null;
}

/** The file picker takes focus, so blur must not close the window while it is open. */
export function setQuickCapturePicking(next: boolean): void {
  picking = next;
}

export function closeQuickCapture(): void {
  const win = overlay;
  overlay = null;
  snapshot = null;
  picking = false;
  if (win && !win.isDestroyed()) win.close();
}

/** Upper third of the display under the pointer, like Spotlight. */
function quickCaptureBounds(area: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const width = Math.min(WIDTH, area.width);
  const height = Math.min(HEIGHT, area.height);
  return {
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.max(0, (area.height - height) / 3)),
  };
}

/** A fresh window per open, because a hidden one would keep Pond running after its last real window closes. */
export async function openQuickCapture(
  next: QuickCaptureSnapshot,
): Promise<void> {
  closeQuickCapture();
  const behavior = overlayBehavior(
    process.platform,
    process.env.XDG_SESSION_TYPE,
  );
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const options: BrowserWindowConstructorOptions = {
    ...quickCaptureBounds(display.workArea),
    title: "Quick Capture",
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: resolvePreload("quick-capture.cjs"),
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
  if (behavior.allWorkspaces)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  win.on("blur", () => {
    if (overlay === win && !picking) closeQuickCapture();
  });
  win.once("closed", () => {
    if (overlay !== win) return;
    overlay = null;
    snapshot = null;
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  try {
    if (devUrl)
      await win.loadURL(new URL("quick-capture.html", `${devUrl}/`).toString());
    else await win.loadFile(resolveMainOut("../renderer/quick-capture.html"));
  } catch (error) {
    if (!win.isDestroyed()) win.destroy();
    throw error;
  }
}

/** Shown only after the renderer paints, so it never flashes an empty window. */
export function presentQuickCapture(): void {
  const win = overlay;
  if (!win || win.isDestroyed() || win.isVisible()) return;
  win.show();
  win.focus();
}
