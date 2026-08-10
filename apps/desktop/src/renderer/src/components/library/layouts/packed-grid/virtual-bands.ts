import type { PackedItem } from "./uniform-pack";

/** A fixed virtual surface unit; cards retain their independently packed geometry. */
export const PACKED_GRID_BAND_PX = 512;

export function buildVirtualBands(
  items: ReadonlyArray<PackedItem>,
  totalHeight: number,
  bandSize = PACKED_GRID_BAND_PX,
): number[][] {
  if (totalHeight <= 0 || bandSize <= 0) return [];

  const bandCount = Math.ceil(totalHeight / bandSize);
  const bands = Array.from({ length: bandCount }, () => [] as number[]);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.height <= 0) continue;

    const top = Math.max(0, item.top);
    const bottom = Math.min(totalHeight, item.top + item.height);
    if (bottom <= top) continue;

    const firstBand = Math.min(bandCount - 1, Math.floor(top / bandSize));
    const lastBand = Math.min(bandCount - 1, Math.ceil(bottom / bandSize) - 1);
    for (let band = firstBand; band <= lastBand; band += 1) {
      bands[band]?.push(index);
    }
  }

  return bands;
}

export function indicesForVirtualBands(
  bands: ReadonlyArray<ReadonlyArray<number>>,
  bandIndexes: ReadonlyArray<number>,
): number[] {
  const indices = new Set<number>();
  for (const bandIndex of bandIndexes) {
    const band = bands[bandIndex];
    if (!band) continue;
    for (const itemIndex of band) indices.add(itemIndex);
  }
  return [...indices].sort((a, b) => a - b);
}
