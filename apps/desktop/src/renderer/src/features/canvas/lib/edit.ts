import { CANVAS_COLORS } from "@shared/canvas-contracts";
import type {
  CanvasColor,
  CanvasConnector,
  CanvasCrop,
  CanvasItem,
  CanvasOutline,
  CanvasSide,
} from "@shared/canvas-contracts";
import type { XYPosition } from "@xyflow/react";
import { CONNECTOR_STYLE, drawingFrom, GRID, newId, snap } from "./document";
import type { StrokePoint } from "./document";

const GAP = 48;
const CELL = { width: 144, height: 48 };

const OPPOSITE = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
} as const;

const MINIMUM = {
  note: { width: 96, height: 96 },
  figure: { width: 48, height: 48 },
  text: { width: 80, height: 32 },
  section: { width: 240, height: 144 },
  table: { width: 144, height: 48 },
  code: { width: 160, height: 72 },
  topic: { width: 96, height: 40 },
} as const;

export type StampKind = keyof typeof MINIMUM;

export interface StampOptions {
  color: CanvasColor;
  outline: CanvasOutline;
  language: string;
}

function boxOf(raw: { x: number; y: number; width: number; height: number }) {
  const left = Math.min(raw.x, raw.x + raw.width);
  const top = Math.min(raw.y, raw.y + raw.height);
  const right = Math.max(raw.x, raw.x + raw.width);
  const bottom = Math.max(raw.y, raw.y + raw.height);
  const x = snap(left);
  const y = snap(top);
  return {
    x,
    y,
    width: Math.max(snap(right) - x, GRID),
    height: Math.max(snap(bottom) - y, GRID),
  };
}

/** A dragged rectangle becomes the item, snapped to the grid and at least one cell big. */
export function itemForRect(
  kind: StampKind,
  raw: { x: number; y: number; width: number; height: number },
  options: StampOptions,
): CanvasItem {
  const fitted = boxOf(raw);
  const width = Math.max(fitted.width, MINIMUM[kind].width);
  const height = Math.max(fitted.height, MINIMUM[kind].height);
  const frame = { id: newId(), x: fitted.x, y: fitted.y, width, height };
  switch (kind) {
    case "note":
      return { ...frame, kind, text: "", color: options.color };
    case "figure":
      return {
        ...frame,
        kind,
        outline: options.outline,
        text: "",
        color: options.color,
      };
    case "text":
      return { ...frame, kind, text: "" };
    case "section":
      return { ...frame, kind, title: "Section", color: options.color };
    case "table": {
      const columns = Math.min(30, Math.max(1, Math.round(width / CELL.width)));
      const rowCount = Math.min(
        100,
        Math.max(1, Math.round(height / CELL.height)),
      );
      return {
        ...frame,
        kind,
        rows: Array.from({ length: rowCount }, () =>
          Array.from({ length: columns }, () => ""),
        ),
        color: options.color,
      };
    }
    case "code":
      return { ...frame, kind, text: "", language: options.language };
    case "topic":
      return { ...frame, kind, text: "", color: options.color };
  }
}

/** The copy sits most of its own size away, so the connector between them stays readable. */
function spacing(size: number): number {
  return Math.max(GAP, Math.round(size * 0.8));
}

function beside(item: CanvasItem, side: CanvasSide): XYPosition {
  switch (side) {
    case "left":
      return { x: item.x - item.width - spacing(item.width), y: item.y };
    case "right":
      return { x: item.x + item.width + spacing(item.width), y: item.y };
    case "top":
      return { x: item.x, y: item.y - item.height - spacing(item.height) };
    case "bottom":
      return { x: item.x, y: item.y + item.height + spacing(item.height) };
  }
}

/** A same-size copy on one side, with a connector back to the original. */
export function quickPair(
  item: CanvasItem,
  side: CanvasSide,
): { item: CanvasItem; connector: CanvasConnector } | null {
  if (
    item.kind !== "note" &&
    item.kind !== "figure" &&
    item.kind !== "text" &&
    item.kind !== "topic"
  ) {
    return null;
  }
  const { locked: _locked, group: _group, ...rest } = item;
  const created = {
    ...rest,
    ...beside(item, side),
    id: newId(),
    text: "",
  };
  const connector: CanvasConnector = {
    ...CONNECTOR_STYLE,
    id: newId(),
    from: item.id,
    to: created.id,
    fromSide: side,
    toSide: OPPOSITE[side],
    color: item.kind === "text" ? "gray" : item.color,
  };
  return { item: created, connector };
}

/** `0` comes back unset, so an upright item stores no rotation. */
export function turned(
  rotation: number | undefined,
  delta: number,
): number | undefined {
  const next = ((((rotation ?? 0) + delta) % 360) + 360) % 360;
  return next === 0 ? undefined : next;
}

export function turnOf(angle: number, step: number): number | undefined {
  return turned(0, Math.round(angle / step) * step);
}

export function flipped(
  item: Extract<CanvasItem, { kind: "figure" }>,
  axis: "horizontal" | "vertical",
): Extract<CanvasItem, { kind: "figure" }> {
  if (axis === "horizontal") {
    const { flipX: _flipX, ...rest } = item;
    return item.flipX ? rest : { ...item, flipX: true };
  }
  const { flipY: _flipY, ...rest } = item;
  return item.flipY ? rest : { ...item, flipY: true };
}

export function noteFromText(
  item: Extract<CanvasItem, { kind: "text" }>,
  color: CanvasColor,
): Extract<CanvasItem, { kind: "note" }> {
  const { kind: _kind, ...rest } = item;
  return { ...rest, kind: "note", color };
}

/** Notes land in color order, in rows of four, from the selection's top left. */
export function notesSorted(
  notes: ReadonlyArray<{
    id: string;
    color: CanvasColor;
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
): Map<string, XYPosition> {
  const rank = new Map(CANVAS_COLORS.map((color, index) => [color, index]));
  const ordered = [...notes].sort(
    (a, b) =>
      (rank.get(a.color) ?? 0) - (rank.get(b.color) ?? 0) ||
      a.y - b.y ||
      a.x - b.x,
  );
  const originX = Math.min(...notes.map((note) => note.x));
  const originY = Math.min(...notes.map((note) => note.y));
  const positions = new Map<string, XYPosition>();
  let column = 0;
  let x = originX;
  let y = originY;
  let rowHeight = 0;
  for (const note of ordered) {
    if (column === 4) {
      column = 0;
      x = originX;
      y += rowHeight + GRID;
      rowHeight = 0;
    }
    positions.set(note.id, { x, y });
    x += note.width + GRID;
    rowHeight = Math.max(rowHeight, note.height);
    column += 1;
  }
  return positions;
}

function hits(
  point: StrokePoint,
  eraser: ReadonlyArray<StrokePoint>,
  radius: number,
): boolean {
  return eraser.some(
    (mark) => Math.hypot(point[0] - mark[0], point[1] - mark[1]) <= radius,
  );
}

function splitDrawing(
  item: Extract<CanvasItem, { kind: "drawing" }>,
  eraser: ReadonlyArray<StrokePoint>,
  radius: number,
): Array<CanvasItem> | null {
  const runs: Array<Array<StrokePoint>> = [];
  let current: Array<StrokePoint> = [];
  let removed = false;
  for (const [x, y, pressure] of item.points) {
    const absolute: StrokePoint = [x + item.x, y + item.y, pressure];
    if (hits(absolute, eraser, radius)) {
      removed = true;
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    current.push(absolute);
  }
  if (current.length > 1) runs.push(current);
  if (!removed) return null;
  return runs.flatMap((points) => {
    const drawing = drawingFrom(
      points,
      item.color,
      item.size,
      item.ink === "highlight" ? "highlight" : undefined,
    );
    return drawing ? [drawing] : [];
  });
}

/** Cuts marker strokes where the eraser passed. `null` means nothing changed. */
export function eraseDrawings(
  items: ReadonlyArray<CanvasItem>,
  eraser: ReadonlyArray<StrokePoint>,
  radius: number,
): Array<CanvasItem> | null {
  if (!eraser.length) {
    return null;
  }
  let changed = false;
  const next: Array<CanvasItem> = [];
  for (const item of items) {
    if (item.kind !== "drawing") {
      next.push(item);
      continue;
    }
    const pieces = splitDrawing(item, eraser, radius);
    if (!pieces) {
      next.push(item);
      continue;
    }
    changed = true;
    next.push(...pieces);
  }
  return changed ? next : null;
}

function fraction(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

export function cropOf(
  start: { x: number; y: number },
  end: { x: number; y: number },
): CanvasCrop | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 0.02 || height < 0.02) {
    return null;
  }
  const crop = {
    x: fraction(x),
    y: fraction(y),
    width: fraction(Math.min(width, 1 - fraction(x))),
    height: fraction(Math.min(height, 1 - fraction(y))),
  };
  return crop.width >= 0.02 && crop.height >= 0.02 ? crop : null;
}
