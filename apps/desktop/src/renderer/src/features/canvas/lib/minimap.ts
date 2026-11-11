import type { Viewport, XYPosition } from "@xyflow/react";
import type { Box, Size } from "./transform";

/** Maps board coordinates into the minimap: `map = (board - bounds) * scale + offset`. */
export interface MinimapFrame {
  bounds: Box;
  scale: number;
  offset: XYPosition;
}

export function visibleArea(viewport: Viewport, size: Size): Box {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom,
  };
}

/** The visible area is part of the bounds so the viewport rectangle never leaves the map. */
export function boardBounds(items: readonly Box[], visible: Box): Box {
  let left = visible.x;
  let top = visible.y;
  let right = visible.x + visible.width;
  let bottom = visible.y + visible.height;
  for (const item of items) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function fitFrame(
  bounds: Box,
  map: Size,
  padding: number,
): MinimapFrame {
  const room = {
    width: Math.max(map.width - padding * 2, 1),
    height: Math.max(map.height - padding * 2, 1),
  };
  const scale = Math.min(
    room.width / Math.max(bounds.width, 1),
    room.height / Math.max(bounds.height, 1),
  );
  return {
    bounds,
    scale,
    offset: {
      x: (map.width - bounds.width * scale) / 2,
      y: (map.height - bounds.height * scale) / 2,
    },
  };
}

export function toMap(box: Box, frame: MinimapFrame): Box {
  return {
    x: (box.x - frame.bounds.x) * frame.scale + frame.offset.x,
    y: (box.y - frame.bounds.y) * frame.scale + frame.offset.y,
    width: box.width * frame.scale,
    height: box.height * frame.scale,
  };
}

export function toBoard(point: XYPosition, frame: MinimapFrame): XYPosition {
  return {
    x: (point.x - frame.offset.x) / frame.scale + frame.bounds.x,
    y: (point.y - frame.offset.y) / frame.scale + frame.bounds.y,
  };
}

/** A press inside the viewport rectangle keeps its grip; `null` means the press missed it. */
export function grabOffset(point: XYPosition, view: Box): XYPosition | null {
  const inside =
    point.x >= view.x &&
    point.x <= view.x + view.width &&
    point.y >= view.y &&
    point.y <= view.y + view.height;
  if (!inside) return null;
  return {
    x: point.x - (view.x + view.width / 2),
    y: point.y - (view.y + view.height / 2),
  };
}

export function centeredOn(
  point: XYPosition,
  zoom: number,
  size: Size,
): Viewport {
  return {
    x: size.width / 2 - point.x * zoom,
    y: size.height / 2 - point.y * zoom,
    zoom,
  };
}

export function viewportAt(
  point: XYPosition,
  grab: XYPosition,
  frame: MinimapFrame,
  zoom: number,
  size: Size,
): Viewport {
  const center = toBoard({ x: point.x - grab.x, y: point.y - grab.y }, frame);
  return centeredOn(center, zoom, size);
}
