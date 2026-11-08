import { describe, expect, it } from "vitest";
import {
  clampRange,
  formatClock,
  heatmapPath,
  mostReplayed,
  shiftRange,
  storyboardTile,
} from "./range";

const flat = (values: number[], step = 2) =>
  values.map((value, index) => ({
    start: index * step,
    end: (index + 1) * step,
    value,
  }));

describe("clampRange", () => {
  it("keeps at least a second inside the video", () => {
    expect(clampRange({ start: -4, end: 0.2 }, 60)).toEqual({
      start: 0,
      end: 1,
    });
    expect(clampRange({ start: 70, end: 90 }, 60)).toEqual({
      start: 59,
      end: 60,
    });
  });
});

describe("shiftRange", () => {
  it("moves without resizing and stops at the ends", () => {
    expect(shiftRange({ start: 10, end: 20 }, 45, 60)).toEqual({
      start: 50,
      end: 60,
    });
    expect(shiftRange({ start: 10, end: 20 }, -15, 60)).toEqual({
      start: 0,
      end: 10,
    });
  });
});

describe("mostReplayed", () => {
  it("spans the peak while it stays above most of its height", () => {
    const heatmap = flat([0.1, 0.2, 0.7, 1, 0.8, 0.3, 0.1], 5);
    expect(mostReplayed(heatmap, 35)).toEqual({ start: 10, end: 25 });
  });

  it("widens a sharp spike to a watchable clip", () => {
    const heatmap = flat([0.1, 0.1, 1, 0.1, 0.1], 2);
    expect(mostReplayed(heatmap, 10)).toEqual({ start: 1, end: 9 });
  });

  it("needs a curve", () => {
    expect(mostReplayed([], 10)).toBeNull();
  });
});

describe("storyboardTile", () => {
  const storyboard = {
    tileWidth: 160,
    tileHeight: 90,
    columns: 3,
    rows: 3,
    interval: 2,
    sheets: [
      { url: "a", start: 0, duration: 18 },
      { url: "b", start: 18, duration: 10 },
    ],
  };

  it("finds the sheet and cell for a time", () => {
    expect(storyboardTile(storyboard, 9)).toMatchObject({
      url: "a",
      column: 1,
      row: 1,
    });
    expect(storyboardTile(storyboard, 21)).toMatchObject({
      url: "b",
      column: 1,
      row: 0,
    });
  });

  it("holds the last cell past the end", () => {
    expect(storyboardTile(storyboard, 400)).toMatchObject({
      url: "b",
      column: 2,
      row: 2,
    });
  });
});

describe("heatmapPath", () => {
  it("closes an area across the full width", () => {
    const path = heatmapPath(flat([0, 1, 0]), 6);
    expect(path?.startsWith("M 0 100")).toBe(true);
    expect(path?.endsWith("L 1000 100 Z")).toBe(true);
  });
});

describe("formatClock", () => {
  it("drops hours under an hour", () => {
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
