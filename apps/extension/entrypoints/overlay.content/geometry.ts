import type { CaptureRegion } from "@/utils/messaging";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: ReadonlyArray<Handle> = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

const MIN_SIZE = 8;

function currentViewport(): Viewport {
  return { width: innerWidth, height: innerHeight };
}

export function clampPoint(
  x: number,
  y: number,
  viewport: Viewport = currentViewport(),
): Point {
  return {
    x: Math.min(viewport.width, Math.max(0, x)),
    y: Math.min(viewport.height, Math.max(0, y)),
  };
}

export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Screenshots only see the viewport, so clip to it and drop slivers too small to save. */
export function viewportRegion(
  rect: Rect,
  viewport: Viewport = currentViewport(),
): CaptureRegion | null {
  const start = clampPoint(rect.x, rect.y, viewport);
  const end = clampPoint(rect.x + rect.width, rect.y + rect.height, viewport);
  const width = end.x - start.x;
  const height = end.y - start.y;
  if (width < 2 || height < 2) return null;
  return {
    ...start,
    width,
    height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
}

export function clipRect(
  rect: Rect,
  viewport: Viewport = currentViewport(),
): Rect | null {
  const region = viewportRegion(rect, viewport);
  if (!region || region.width < MIN_SIZE || region.height < MIN_SIZE) {
    return null;
  }
  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };
}

export function moveRect(
  rect: Rect,
  dx: number,
  dy: number,
  viewport: Viewport = currentViewport(),
): Rect {
  return {
    ...rect,
    x: Math.min(viewport.width - rect.width, Math.max(0, rect.x + dx)),
    y: Math.min(viewport.height - rect.height, Math.max(0, rect.y + dy)),
  };
}

/** Drags one edge or corner; crossing the opposite edge flips the box instead of inverting it. */
export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  viewport: Viewport = currentViewport(),
): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) {
    left += dx;
  }
  if (handle.includes("e")) {
    right += dx;
  }
  if (handle.includes("n")) {
    top += dy;
  }
  if (handle.includes("s")) {
    bottom += dy;
  }
  const a = clampPoint(left, top, viewport);
  const b = clampPoint(right, bottom, viewport);
  const next = rectBetween(a, b);
  return {
    ...next,
    width: Math.max(1, next.width),
    height: Math.max(1, next.height),
  };
}
