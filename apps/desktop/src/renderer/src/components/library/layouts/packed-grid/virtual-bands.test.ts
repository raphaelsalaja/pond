import { describe, expect, it } from "vitest";
import { buildVirtualBands, indicesForVirtualBands } from "./virtual-bands";

describe("packed-grid virtual bands", () => {
  const items = [
    { id: "a", top: 0, left: 0, width: 100, height: 80 },
    { id: "b", top: 80, left: 0, width: 100, height: 40 },
    { id: "c", top: 190, left: 0, width: 100, height: 30 },
  ];

  it("indexes an item into every vertical band it intersects", () => {
    expect(buildVirtualBands(items, 240, 100)).toEqual([[0, 1], [1, 2], [2]]);
  });

  it("deduplicates cards that span multiple visible bands", () => {
    const bands = buildVirtualBands(items, 240, 100);
    expect(indicesForVirtualBands(bands, [0, 1, 2])).toEqual([0, 1, 2]);
  });

  it("returns source order regardless of virtual band order", () => {
    const bands = buildVirtualBands(items, 240, 100);
    expect(indicesForVirtualBands(bands, [2, 0])).toEqual([0, 1, 2]);
  });

  it("returns no bands for an empty surface", () => {
    expect(buildVirtualBands(items, 0, 100)).toEqual([]);
  });
});
