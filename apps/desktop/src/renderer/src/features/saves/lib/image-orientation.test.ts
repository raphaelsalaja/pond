import { describe, expect, it } from "vitest";
import {
  orientAspectRatio,
  orientedDimensions,
  rotationSwapsAxes,
} from "./image-orientation";

describe("rotationSwapsAxes", () => {
  it("swaps only quarter turns", () => {
    expect(rotationSwapsAxes(0)).toBe(false);
    expect(rotationSwapsAxes(180)).toBe(false);
    expect(rotationSwapsAxes(360)).toBe(false);
    expect(rotationSwapsAxes(90)).toBe(true);
    expect(rotationSwapsAxes(270)).toBe(true);
    expect(rotationSwapsAxes(-90)).toBe(true);
    expect(rotationSwapsAxes(450)).toBe(true);
    expect(rotationSwapsAxes(null)).toBe(false);
  });
});

describe("orientedDimensions", () => {
  it("swaps stored pixel dimensions after a 90 or 270 degree rotation", () => {
    expect(orientedDimensions(1200, 800, 90)).toEqual({
      width: 800,
      height: 1200,
    });
    expect(orientedDimensions(1200, 800, 270)).toEqual({
      width: 800,
      height: 1200,
    });
  });

  it("keeps the stored pixel dimensions for upright rotations", () => {
    expect(orientedDimensions(1200, 800, 0)).toEqual({
      width: 1200,
      height: 800,
    });
    expect(orientedDimensions(1200, 800, 180)).toEqual({
      width: 1200,
      height: 800,
    });
  });
});

describe("orientAspectRatio", () => {
  it("inverts the grid aspect for a quarter turn", () => {
    expect(orientAspectRatio(1.5, 90)).toBeCloseTo(2 / 3);
    expect(orientAspectRatio(1.5, 180)).toBe(1.5);
  });
});
