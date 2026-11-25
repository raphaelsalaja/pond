import { popcount64 } from "./bits";

export const DHASH_WIDTH = 9;
export const DHASH_HEIGHT = 8;

/** Bit order matches `encodePhash`: row-major, most significant bit first, set when a pixel is brighter than its right neighbour. */
export function dhashFromGray(pixels: ArrayLike<number>): bigint {
  let bits = 0n;
  let index = 0;
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      const left = pixels[y * DHASH_WIDTH + x] ?? 0;
      const right = pixels[y * DHASH_WIDTH + x + 1] ?? 0;
      if (left > right) bits |= 1n << BigInt(63 - index);
      index += 1;
    }
  }
  return bits;
}

/** Flat images, black frames, and smooth gradients set almost no bits, so their hashes collide with each other. */
export function isLowDetailHash(hash: bigint): boolean {
  const bits = popcount64(hash);
  return bits < 6 || bits > 58;
}

export interface GrayImage {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
}

/** Box-averages a region of a greyscale image into the 9×8 grid a dHash reads. */
export function sampleDhashGrid(
  image: GrayImage,
  region: { left: number; top: number; right: number; bottom: number } = {
    left: 0,
    top: 0,
    right: image.width,
    bottom: image.height,
  },
): Float64Array {
  const grid = new Float64Array(DHASH_WIDTH * DHASH_HEIGHT);
  const cellWidth = (region.right - region.left) / DHASH_WIDTH;
  const cellHeight = (region.bottom - region.top) / DHASH_HEIGHT;
  for (let gy = 0; gy < DHASH_HEIGHT; gy++) {
    const y0 = Math.floor(region.top + gy * cellHeight);
    const y1 = Math.max(y0 + 1, Math.floor(region.top + (gy + 1) * cellHeight));
    for (let gx = 0; gx < DHASH_WIDTH; gx++) {
      const x0 = Math.floor(region.left + gx * cellWidth);
      const x1 = Math.max(
        x0 + 1,
        Math.floor(region.left + (gx + 1) * cellWidth),
      );
      let sum = 0;
      let count = 0;
      for (let y = y0; y < Math.min(y1, image.height); y++) {
        for (let x = x0; x < Math.min(x1, image.width); x++) {
          sum += image.pixels[y * image.width + x] ?? 0;
          count += 1;
        }
      }
      grid[gy * DHASH_WIDTH + gx] = count ? sum / count : 0;
    }
  }
  return grid;
}

export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}
