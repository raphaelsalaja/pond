import { describe, expect, it } from "vitest";
import {
  clipRect,
  moveRect,
  rectBetween,
  resizeRect,
  viewportRegion,
} from "./geometry";

const viewport = { width: 800, height: 600 };

describe("overlay geometry", () => {
  it("clips an element to the viewport", () => {
    expect(
      viewportRegion({ x: -20, y: 500, width: 200, height: 400 }, viewport),
    ).toEqual({
      x: 0,
      y: 500,
      width: 180,
      height: 100,
      viewportWidth: 800,
      viewportHeight: 600,
    });
  });

  it("drops an element outside the viewport", () => {
    expect(
      viewportRegion({ x: 900, y: 0, width: 50, height: 50 }, viewport),
    ).toBeNull();
  });

  it("normalizes a drag in any direction", () => {
    expect(rectBetween({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
  });

  it("drops a selection too small to adjust", () => {
    expect(clipRect({ x: 10, y: 10, width: 4, height: 40 }, viewport)).toBeNull();
    expect(clipRect({ x: 790, y: 10, width: 40, height: 40 }, viewport)).toEqual(
      {
        x: 790,
        y: 10,
        width: 10,
        height: 40,
      },
    );
  });

  it("keeps a moved box inside the viewport", () => {
    expect(
      moveRect({ x: 700, y: 10, width: 200, height: 100 }, 50, -50, viewport),
    ).toEqual({ x: 600, y: 0, width: 200, height: 100 });
  });

  it("resizes from a corner and flips past the opposite edge", () => {
    const box = { x: 100, y: 100, width: 100, height: 100 };
    expect(resizeRect(box, "se", 50, 20, viewport)).toEqual({
      x: 100,
      y: 100,
      width: 150,
      height: 120,
    });
    expect(resizeRect(box, "w", 150, 0, viewport)).toEqual({
      x: 200,
      y: 100,
      width: 50,
      height: 100,
    });
    expect(resizeRect(box, "n", 0, -500, viewport)).toMatchObject({
      y: 0,
      height: 200,
    });
  });
});
