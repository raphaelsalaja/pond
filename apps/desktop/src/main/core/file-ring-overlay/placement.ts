interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The 360px ring plus room for its shadow. */
export const OVERLAY_SIZE = 440;

function gap(area: Rect, point: Point): number {
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return Math.hypot(dx, dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Centers on the pointer and slides inward at screen edges, on the display under the pointer or the nearest one. */
export function overlayBounds(
  pointer: Point,
  workAreas: readonly Rect[],
  size = OVERLAY_SIZE,
): Rect | null {
  const area = workAreas.toSorted(
    (left, right) => gap(left, pointer) - gap(right, pointer),
  )[0];
  if (!area) return null;
  const width = Math.min(size, area.width);
  const height = Math.min(size, area.height);
  return {
    x: Math.round(
      clamp(pointer.x - width / 2, area.x, area.x + area.width - width),
    ),
    y: Math.round(
      clamp(pointer.y - height / 2, area.y, area.y + area.height - height),
    ),
    width,
    height,
  };
}

export function areaCenter(area: Rect): Point {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

export interface OverlayBehavior {
  /** A non-activating panel takes Escape without bringing Pond in front of the app you're in. */
  panel: boolean;
  allWorkspaces: boolean;
  atPointer: boolean;
}

export function overlayBehavior(
  platform: NodeJS.Platform,
  sessionType: string | undefined,
): OverlayBehavior {
  if (platform === "darwin")
    return { panel: true, allWorkspaces: true, atPointer: true };
  /** Windows has no non-activating windows or workspace pinning, so the ring takes focus until it closes and shows on the current desktop only. */
  if (platform === "win32")
    return { panel: false, allWorkspaces: false, atPointer: true };
  /** Wayland hides the pointer outside Pond's windows and places windows itself, so the ring opens on the primary display instead. */
  return {
    panel: false,
    allWorkspaces: true,
    atPointer: sessionType !== "wayland",
  };
}
