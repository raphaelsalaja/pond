export interface PositionedItem {
  top: number;
  height: number;
}

export type VisibilityMode = "monotonic" | "scan";

/** Roughly two laptop viewports: enough runway for local preview reads + decode during a fast trackpad scroll. */
export const OVERSCAN_PX = 1600;

/** First index whose bottom edge reaches `viewMin` (items ordered by nondecreasing `top`). */
function lowerBoundMonotonic<T extends PositionedItem>(
  items: T[],
  viewMin: number,
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid];
    if (!item || item.top + item.height < viewMin) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index whose `top` is strictly above `viewMax`. */
function upperBoundMonotonic<T extends PositionedItem>(
  items: T[],
  viewMax: number,
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid];
    if (!item || item.top <= viewMax) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function computeVisibleMonotonic<T extends PositionedItem>(
  items: T[],
  viewMin: number,
  viewMax: number,
): number[] {
  const start = lowerBoundMonotonic(items, viewMin);
  const end = upperBoundMonotonic(items, viewMax);
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

function computeVisibleScan<T extends PositionedItem>(
  items: T[],
  viewMin: number,
  viewMax: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.top + item.height < viewMin) continue;
    if (item.top > viewMax) continue;
    out.push(i);
  }
  return out;
}

/** Waterfall tops are not monotonic by index; justified/uniform are. */
export function computeVisible<T extends PositionedItem>(
  items: T[],
  offsetWithinGrid: number,
  viewportH: number,
  mode: VisibilityMode = "scan",
): number[] {
  const viewMin = offsetWithinGrid - OVERSCAN_PX;
  const viewMax = offsetWithinGrid + viewportH + OVERSCAN_PX;
  return mode === "monotonic"
    ? computeVisibleMonotonic(items, viewMin, viewMax)
    : computeVisibleScan(items, viewMin, viewMax);
}

export function sameIndices(a: number[], b: number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
