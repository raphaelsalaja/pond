import { snap } from "./document";
import type { Bounds } from "./document";

export interface Guide {
  /** The axis the guide measures: `x` guides are vertical lines. */
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

export interface ObjectSnap {
  x: number | null;
  y: number | null;
  guides: Array<Guide>;
}

function linesOf(frame: Bounds, axis: "x" | "y"): Array<number> {
  return axis === "x"
    ? [frame.x, frame.x + frame.width / 2, frame.x + frame.width]
    : [frame.y, frame.y + frame.height / 2, frame.y + frame.height];
}

function spanOf(frame: Bounds, axis: "x" | "y"): [number, number] {
  return axis === "x"
    ? [frame.y, frame.y + frame.height]
    : [frame.x, frame.x + frame.width];
}

/** Edges and centres of the moving box pull to the nearest edge or centre of another item within the threshold. */
export function snapToObjects(
  moving: Bounds,
  others: ReadonlyArray<Bounds>,
  threshold: number,
): ObjectSnap {
  const result: ObjectSnap = { x: null, y: null, guides: [] };
  for (const axis of ["x", "y"] as const) {
    let best: { offset: number; at: number } | null = null;
    for (const line of linesOf(moving, axis)) {
      for (const other of others) {
        for (const target of linesOf(other, axis)) {
          const offset = target - line;
          if (
            Math.abs(offset) <= threshold &&
            (!best || Math.abs(offset) < Math.abs(best.offset))
          ) {
            best = { offset, at: target };
          }
        }
      }
    }
    if (!best) {
      continue;
    }
    const { offset, at } = best;
    result[axis] = offset;
    const shifted =
      axis === "x"
        ? { ...moving, x: moving.x + offset }
        : { ...moving, y: moving.y + offset };
    const spans = [shifted, ...others].flatMap((frame) =>
      linesOf(frame, axis).some((line) => Math.abs(line - at) < 0.5)
        ? [spanOf(frame, axis)]
        : [],
    );
    result.guides.push({
      axis,
      at,
      from: Math.min(...spans.map(([start]) => start)),
      to: Math.max(...spans.map(([, end]) => end)),
    });
  }
  return result;
}

/** Only the edges a resize moved land on the grid, so an item placed off the grid keeps its other edges. */
export function snapResize(before: Bounds, after: Bounds): Bounds {
  let { x, y, width, height } = after;
  const right = x + width;
  const bottom = y + height;
  if (x !== before.x) {
    x = snap(x);
    width = right - x;
  } else if (right !== before.x + before.width) {
    width = snap(right) - x;
  }
  if (y !== before.y) {
    y = snap(y);
    height = bottom - y;
  } else if (bottom !== before.y + before.height) {
    height = snap(bottom) - y;
  }
  return {
    id: after.id,
    x,
    y,
    width: width > 0 ? width : after.width,
    height: height > 0 ? height : after.height,
  };
}
