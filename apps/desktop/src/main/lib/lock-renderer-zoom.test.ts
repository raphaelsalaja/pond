import { expect, it } from "vitest";
import { lockRendererZoom } from "./lock-renderer-zoom";

it("locks visual zoom to 1x", () => {
  const limits: Array<[number, number]> = [];
  lockRendererZoom({
    isDestroyed: () => false,
    setVisualZoomLevelLimits: async (min, max) => {
      limits.push([min, max]);
    },
  });
  expect(limits).toEqual([[1, 1]]);
});

it("skips destroyed web contents", () => {
  const limits: Array<[number, number]> = [];
  lockRendererZoom({
    isDestroyed: () => true,
    setVisualZoomLevelLimits: async (min, max) => {
      limits.push([min, max]);
    },
  });
  expect(limits).toEqual([]);
});
