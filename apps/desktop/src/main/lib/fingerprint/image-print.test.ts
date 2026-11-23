import { describe, expect, it } from "vitest";
import { hamming64, popcount64 } from "./bits";
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  dhashFromGray,
  hashToHex,
  isLowDetailHash,
  sampleDhashGrid,
} from "./dhash";
import { HammingIndex } from "./hamming-index";
import {
  decodeImagePrint,
  encodeImagePrint,
  imagePrintFromGray,
} from "./image-print";

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomHash(next: () => number): bigint {
  return (BigInt(next()) << 32n) | BigInt(next());
}

describe("bits", () => {
  it("counts bits across both halves", () => {
    expect(popcount64(0n)).toBe(0);
    expect(popcount64(0xffff_ffff_ffff_ffffn)).toBe(64);
    expect(popcount64(0x8000_0000_0000_0001n)).toBe(2);
    expect(hamming64(0b1010n, 0b0110n)).toBe(2);
  });
});

describe("dHash", () => {
  it("sets a bit where a pixel is brighter than its right neighbour", () => {
    const falling = Array.from(
      { length: DHASH_WIDTH * DHASH_HEIGHT },
      (_, index) => DHASH_WIDTH - (index % DHASH_WIDTH),
    );
    expect(dhashFromGray(falling)).toBe(0xffff_ffff_ffff_ffffn);
    expect(dhashFromGray(falling.map((value) => -value))).toBe(0n);
    const first = Array.from({ length: DHASH_WIDTH * DHASH_HEIGHT }, () => 0);
    first[0] = 1;
    expect(hashToHex(dhashFromGray(first))).toBe("8000000000000000");
  });

  it("treats near-empty and near-full hashes as low detail", () => {
    expect(isLowDetailHash(0n)).toBe(true);
    expect(isLowDetailHash(0b11111n)).toBe(true);
    expect(isLowDetailHash(0x0f0f_0f0f_0f0f_0f0fn)).toBe(false);
    expect(isLowDetailHash(0xffff_ffff_ffff_fff0n)).toBe(true);
  });

  it("averages each cell of the requested region", () => {
    const width = 18;
    const height = 8;
    const pixels = Array.from({ length: width * height }, (_, index) =>
      index % width < 9 ? 0 : 90,
    );
    const grid = sampleDhashGrid({ pixels, width, height });
    expect(grid[0]).toBe(0);
    expect(grid[4]).toBe(45);
    expect(grid[8]).toBe(90);
  });
});

describe("image print", () => {
  it("round-trips both hashes", () => {
    const print = { full: 0x0123_4567_89ab_cdefn, center: 0xfedc_ba98n };
    expect(decodeImagePrint(encodeImagePrint(print))).toEqual(print);
    expect(decodeImagePrint(new Uint8Array(8))).toBeNull();
  });

  it("hashes the middle of the image for the center print", () => {
    const size = 100;
    const pixels = Array.from({ length: size * size }, (_, index) => {
      const x = index % size;
      const y = Math.floor(index / size);
      const inside = x >= 10 && x < 90 && y >= 10 && y < 90;
      return inside ? ((x * 7 + y * 13) % 50) * 5 : 255;
    });
    const inner = Array.from({ length: 80 * 80 }, (_, index) => {
      const x = (index % 80) + 10;
      const y = Math.floor(index / 80) + 10;
      return ((x * 7 + y * 13) % 50) * 5;
    });
    const bordered = imagePrintFromGray({ pixels, width: size, height: size });
    const cropped = imagePrintFromGray({
      pixels: inner,
      width: 80,
      height: 80,
    });
    expect(bordered.center).toBe(cropped.full);
  });
});

describe("Hamming index", () => {
  it("returns exactly the hashes a linear scan finds", () => {
    const next = random(7);
    const hashes = Array.from({ length: 2000 }, () => randomHash(next));
    const base = hashes[0] ?? 0n;
    for (let flip = 0; flip < 12; flip++)
      hashes.push(base ^ (1n << BigInt(flip * 5)) ^ (1n << BigInt(flip)));
    const lookup = new HammingIndex<number>();
    for (const [index, hash] of hashes.entries()) lookup.add(hash, index);
    for (const radius of [0, 2, 6, 10]) {
      for (const query of [base, hashes[500] ?? 0n, randomHash(next)]) {
        const expected = hashes
          .map((hash, index) => ({ index, distance: hamming64(hash, query) }))
          .filter((hit) => hit.distance <= radius)
          .map((hit) => hit.index)
          .sort((a, b) => a - b);
        const found = lookup
          .search(query, radius)
          .map((hit) => hit.value)
          .sort((a, b) => a - b);
        expect(found).toEqual(expected);
      }
    }
  });

  it("keeps every value added under the same hash", () => {
    const lookup = new HammingIndex<string>();
    lookup.add(5n, "a");
    lookup.add(5n, "b");
    expect(lookup.search(5n, 0).map((hit) => hit.value)).toEqual(["a", "b"]);
  });
});
