import type { CanvasItem } from "@shared/canvas-contracts";
import type { XYPosition } from "@xyflow/react";

export const CORNERS = ["nw", "ne", "se", "sw"] as const;
export type Corner = (typeof CORNERS)[number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SIZE = {
  save: { width: 140, height: 120 },
  note: { width: 120, height: 80 },
  text: { width: 80, height: 32 },
  drawing: { width: 8, height: 8 },
  figure: { width: 48, height: 48 },
  section: { width: 240, height: 144 },
  table: { width: 96, height: 48 },
  code: { width: 160, height: 72 },
  topic: { width: 96, height: 40 },
} satisfies Record<CanvasItem["kind"], Size>;

/** Resize cursor along a corner's diagonal once the box has turned. */
export function cursorFor(corner: Corner, rotation: number): string {
  const base = corner === "nw" || corner === "se" ? 45 : 135;
  const angle = (((base + rotation) % 180) + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return "ew-resize";
  if (angle < 67.5) return "nwse-resize";
  if (angle < 112.5) return "ns-resize";
  return "nesw-resize";
}

function signsOf(corner: Corner): XYPosition {
  return {
    x: corner === "ne" || corner === "se" ? 1 : -1,
    y: corner === "se" || corner === "sw" ? 1 : -1,
  };
}

function turn(point: XYPosition, radians: number): XYPosition {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/** Where a corner of an upright box lands once the box turns about its center. */
export function cornerAt(box: Box, rotation: number, corner: Corner) {
  const signs = signsOf(corner);
  const offset = turn(
    { x: (signs.x * box.width) / 2, y: (signs.y * box.height) / 2 },
    (rotation * Math.PI) / 180,
  );
  return {
    x: box.x + box.width / 2 + offset.x,
    y: box.y + box.height / 2 + offset.y,
  };
}

/** Resizes a turned box from one corner while the opposite corner stays put on screen. */
export function resizeTurned(
  box: Box,
  rotation: number,
  corner: Corner,
  point: XYPosition,
  min: Size,
  keepAspect: boolean,
): Box {
  const radians = (rotation * Math.PI) / 180;
  const signs = signsOf(corner);
  const anchor = cornerAt(box, rotation, oppositeOf(corner));
  const local = turn(
    { x: point.x - anchor.x, y: point.y - anchor.y },
    -radians,
  );
  let width = Math.max(min.width, signs.x * local.x);
  let height = Math.max(min.height, signs.y * local.y);
  if (keepAspect) {
    const scale = Math.max(
      width / box.width,
      height / box.height,
      min.width / box.width,
      min.height / box.height,
    );
    width = box.width * scale;
    height = box.height * scale;
  }
  const offset = turn(
    { x: (signs.x * width) / 2, y: (signs.y * height) / 2 },
    radians,
  );
  return {
    x: anchor.x + offset.x - width / 2,
    y: anchor.y + offset.y - height / 2,
    width,
    height,
  };
}

function oppositeOf(corner: Corner): Corner {
  switch (corner) {
    case "nw":
      return "se";
    case "ne":
      return "sw";
    case "se":
      return "nw";
    case "sw":
      return "ne";
  }
}

export interface Scale {
  origin: XYPosition;
  x: number;
  y: number;
}

/** Scale for a group box dragged by one corner, never shrinking a member below its minimum. */
export function groupScale(
  bounds: Box,
  corner: Corner,
  point: XYPosition,
  members: ReadonlyArray<Size & { min: Size }>,
  keepAspect: boolean,
): Scale {
  const signs = signsOf(corner);
  const origin = {
    x: signs.x > 0 ? bounds.x : bounds.x + bounds.width,
    y: signs.y > 0 ? bounds.y : bounds.y + bounds.height,
  };
  const floor = members.reduce(
    (least, member) => ({
      x: Math.max(least.x, member.min.width / member.width),
      y: Math.max(least.y, member.min.height / member.height),
    }),
    { x: 0, y: 0 },
  );
  let x = Math.max(floor.x, (signs.x * (point.x - origin.x)) / bounds.width);
  let y = Math.max(floor.y, (signs.y * (point.y - origin.y)) / bounds.height);
  if (keepAspect) {
    const both = Math.max(x, y);
    x = both;
    y = both;
  }
  return { origin, x, y };
}

export function scaleBox(box: Box, scale: Scale): Box {
  return {
    x: scale.origin.x + (box.x - scale.origin.x) * scale.x,
    y: scale.origin.y + (box.y - scale.origin.y) * scale.y,
    width: box.width * scale.x,
    height: box.height * scale.y,
  };
}
