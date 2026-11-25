import { WIDTH } from "../video";

/** The app is laid out at its real pixel size, then zoomed so it reads at 1080p. */
export const ZOOM = 1.28;
export const APP_WIDTH = 1250;
export const APP_HEIGHT = 667;
export const WINDOW_LEFT = (WIDTH - APP_WIDTH * ZOOM) / 2;
export const WINDOW_TOP = 222;

/** The sidebar's New button, in app coordinates. */
export const PLUS = { x: 181, y: 66 };

/** App coordinates to stage coordinates, before any camera move. */
export const toStage = (x: number, y: number) => ({
  x: WINDOW_LEFT + x * ZOOM,
  y: WINDOW_TOP + y * ZOOM,
});

export const ITEM = 28;
export const GAP = 1;
export const PAD = 6;

export interface Placement {
  left: number;
  top: number;
  width: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The New menu, opened from the sidebar's plus button. */
export const NEW_MENU: Placement = { left: 160, top: 92, width: 200 };

export const itemCenter = (menu: Placement, index: number): Point => ({
  x: menu.left + menu.width / 2,
  y: menu.top + PAD + index * (ITEM + GAP) + ITEM / 2,
});

/** Where a submenu opens beside `menu`'s item at `index`, its first item level with that row. */
export const submenuOf = (
  menu: Placement,
  index: number,
  width: number,
): Placement => ({
  left: menu.left + menu.width - 4,
  top: menu.top + index * (ITEM + GAP),
  width,
});

/** The menu item under `point`, or -1. */
export function hit(menu: Placement, count: number, point: Point) {
  if (point.x < menu.left || point.x > menu.left + menu.width) return -1;
  const index = Math.floor((point.y - menu.top - PAD) / (ITEM + GAP));
  return index >= 0 && index < count ? index : -1;
}

/** The white content panel right of the sidebar. */
export const PANEL = { left: 228, top: 44, width: 1014, height: 615 };

/** A canvas board's pan and zoom, as React Flow stores it: screen = point * zoom + offset. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** A point on a canvas board to app coordinates. */
export const boardToApp = (
  viewport: Viewport,
  x: number,
  y: number,
): Point => ({
  x: PANEL.left + viewport.x + x * viewport.zoom,
  y: PANEL.top + viewport.y + y * viewport.zoom,
});

const TOOL = 32;
const TOOL_GAP = 2;
const DOCK_PAD = 4;
const SWATCH = 28;

/** Centers of the canvas tools dock's buttons, by index, in app coordinates. */
export const toolCenter = (index: number): Point => {
  const count = 7;
  const width = count * TOOL + (count - 1) * TOOL_GAP + DOCK_PAD * 2;
  const left = PANEL.left + PANEL.width / 2 - width / 2;
  return {
    x: left + DOCK_PAD + index * (TOOL + TOOL_GAP) + TOOL / 2,
    y: PANEL.top + PANEL.height - 16 - DOCK_PAD - TOOL / 2,
  };
};

/** Centers of the color palette's swatches above the dock, by index, in app coordinates. */
export const swatchCenter = (index: number): Point => {
  const count = 8;
  const width = count * SWATCH + (count - 1) * TOOL_GAP + DOCK_PAD * 2;
  const left = PANEL.left + PANEL.width / 2 - width / 2;
  const dockTop = PANEL.top + PANEL.height - 16 - DOCK_PAD * 2 - TOOL;
  return {
    x: left + DOCK_PAD + index * (SWATCH + TOOL_GAP) + SWATCH / 2,
    y: dockTop - 8 - DOCK_PAD - SWATCH / 2,
  };
};
