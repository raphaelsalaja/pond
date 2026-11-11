import { describe, expect, it } from "vitest";
import {
  centeredFrame,
  cropPlacement,
  cropRect,
  MAX_LOGO_ZOOM,
  panFrame,
  pixelCrop,
  zoomFrame,
} from "./logo-crop";

const WIDE = { width: 400, height: 200 };
const TALL = { width: 300, height: 900 };

describe("logo crop", () => {
  it("starts on the largest centered square", () => {
    expect(cropRect(WIDE, centeredFrame(WIDE))).toEqual({
      x: 100,
      y: 0,
      size: 200,
    });
    expect(cropRect(TALL, centeredFrame(TALL))).toEqual({
      x: 0,
      y: 300,
      size: 300,
    });
  });

  it("zooms around the center without leaving the image", () => {
    const frame = zoomFrame(WIDE, centeredFrame(WIDE), 2);
    expect(cropRect(WIDE, frame)).toEqual({ x: 150, y: 50, size: 100 });
    expect(zoomFrame(WIDE, frame, 0.25).zoom).toBe(1);
    expect(zoomFrame(WIDE, frame, 99).zoom).toBe(MAX_LOGO_ZOOM);
    expect(zoomFrame(WIDE, frame, Number.NaN).zoom).toBe(1);
  });

  it("pans opposite the drag in image pixels", () => {
    const frame = zoomFrame(WIDE, centeredFrame(WIDE), 2);
    const moved = panFrame(WIDE, frame, { x: 40, y: -20 }, 200);
    expect(cropRect(WIDE, moved)).toEqual({ x: 130, y: 60, size: 100 });
  });

  it("stops panning at the image edges", () => {
    const frame = panFrame(
      WIDE,
      centeredFrame(WIDE),
      { x: 10_000, y: 10_000 },
      200,
    );
    expect(cropRect(WIDE, frame)).toEqual({ x: 0, y: 0, size: 200 });
  });

  it("keeps the crop square when zooming out near an edge", () => {
    const corner = panFrame(
      WIDE,
      zoomFrame(WIDE, centeredFrame(WIDE), 4),
      { x: -10_000, y: -10_000 },
      200,
    );
    expect(cropRect(WIDE, corner)).toEqual({ x: 350, y: 150, size: 50 });
    expect(cropRect(WIDE, zoomFrame(WIDE, corner, 1))).toEqual({
      x: 200,
      y: 0,
      size: 200,
    });
  });

  it("rounds to whole pixels inside the image", () => {
    expect(pixelCrop(WIDE, { x: 10.6, y: 0.4, size: 99.5 })).toEqual({
      x: 11,
      y: 0,
      size: 100,
    });
    expect(pixelCrop(WIDE, { x: 390, y: -5, size: 500 })).toEqual({
      x: 200,
      y: 0,
      size: 200,
    });
    expect(pixelCrop(WIDE, { x: Number.NaN, y: 0, size: 0 })).toEqual({
      x: 0,
      y: 0,
      size: 200,
    });
  });

  it("scales the whole image so the crop fills the viewport", () => {
    expect(cropPlacement(WIDE, { x: 150, y: 50, size: 100 }, 200)).toEqual({
      width: 800,
      height: 400,
      x: -300,
      y: -100,
    });
  });
});
