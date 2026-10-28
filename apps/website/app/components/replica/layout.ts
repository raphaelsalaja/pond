/** Mirrors `packWaterfall` and `chromeHeightFor` in the desktop library so cards land where the app puts them. */

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 800;
export const SIDEBAR_WIDTH = 220;
export const DETAILS_WIDTH = 320;

const GAP = 16;
const COLUMN_MIN = 130;
const MAIN_PADDING_INLINE = 20;
export const META_HEIGHT = 12 + 14 * 2 + 4;

export interface WaterfallEntry {
  id: string;
  width: number;
  height: number;
}

export interface WaterfallItem {
  id: string;
  top: number;
  left: number;
  width: number;
  mediaHeight: number;
}

export function centerWidth(detailsOpen: boolean): number {
  return STAGE_WIDTH - SIDEBAR_WIDTH - (detailsOpen ? DETAILS_WIDTH : 0);
}

export function packWaterfall(
  entries: readonly WaterfallEntry[],
  detailsOpen: boolean,
): WaterfallItem[] {
  const containerWidth = centerWidth(detailsOpen) - MAIN_PADDING_INLINE * 2;
  const count = Math.max(
    1,
    Math.floor((containerWidth + GAP) / (COLUMN_MIN + GAP)),
  );
  const width = (containerWidth - GAP * (count - 1)) / count;
  const heights = Array.from({ length: count }, () => 0);

  return entries.map((entry) => {
    const mediaHeight = width / (entry.width / entry.height);
    let target = 0;
    for (let index = 1; index < count; index += 1) {
      if ((heights[index] ?? 0) < (heights[target] ?? 0)) target = index;
    }
    const top = heights[target] ?? 0;
    heights[target] = top + mediaHeight + META_HEIGHT + GAP;
    return {
      id: entry.id,
      top,
      left: target * (width + GAP),
      width,
      mediaHeight,
    };
  });
}
