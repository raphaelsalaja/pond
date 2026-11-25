import { describe, expect, it } from "vitest";
import { computeVisible } from "./visible-indices";
import type { PositionedItem } from "./visible-indices";

function row(tops: Array<number>, height = 100): Array<PositionedItem> {
  return tops.map((top) => ({ top, height }));
}

describe("computeVisible", () => {
  it("monotonic matches scan on nondecreasing tops", () => {
    const items = row([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    const offset = 400;
    const viewportH = 200;
    const mono = computeVisible(items, offset, viewportH, "monotonic");
    const scan = computeVisible(items, offset, viewportH, "scan");
    expect(mono).toEqual(scan);
    expect(mono.length).toBeGreaterThan(0);
  });

  it("monotonic returns a contiguous index range", () => {
    const items = row(
      Array.from({ length: 100 }, (_, i) => i * 50),
      40,
    );
    const out = computeVisible(items, 1000, 300, "monotonic");
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBe((out[i - 1] ?? 0) + 1);
    }
  });

  it("scan finds non-monotonic waterfall-like tops", () => {
    const items: Array<PositionedItem> = [
      { top: 0, height: 200 },
      { top: 0, height: 100 },
      { top: 100, height: 100 },
      { top: 200, height: 300 },
      { top: 220, height: 80 },
    ];
    const scan = computeVisible(items, 150, 100, "scan");
    expect(scan).toContain(0);
    expect(scan).toContain(2);
    expect(scan).toContain(3);
    expect(scan).toContain(4);
  });

  it("empty items yields empty visible set", () => {
    expect(computeVisible([], 0, 800, "monotonic")).toEqual([]);
    expect(computeVisible([], 0, 800, "scan")).toEqual([]);
  });
});
