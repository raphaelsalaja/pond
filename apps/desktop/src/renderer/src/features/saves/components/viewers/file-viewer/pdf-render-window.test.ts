import { describe, expect, it } from "vitest";
import {
  addPdfRenderWindow,
  clampPdfZoom,
  pdfPageWidth,
  stepPdfZoom,
} from "./pdf-render-window";

describe("addPdfRenderWindow", () => {
  it("schedules only the visible page and its neighbors", () => {
    expect([...addPdfRenderWindow(new Set(), 5, 20)]).toEqual([4, 5, 6]);
  });

  it("bounds the render window at the document edges", () => {
    expect([...addPdfRenderWindow(new Set(), 1, 2)]).toEqual([1, 2]);
    expect([...addPdfRenderWindow(new Set(), 2, 2)]).toEqual([1, 2]);
  });

  it("retains pages that already rendered while scrolling", () => {
    expect([...addPdfRenderWindow(new Set([1, 2]), 4, 10)]).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

describe("PDF viewport controls", () => {
  it("clamps and steps zoom without floating point drift", () => {
    expect(stepPdfZoom(1, 1)).toBe(1.1);
    expect(stepPdfZoom(1.1, -1)).toBe(1);
    expect(clampPdfZoom(0.1)).toBe(0.5);
    expect(clampPdfZoom(9)).toBe(2.5);
  });

  it("reserves room for thumbnails and fits a page to the viewport", () => {
    expect(
      pdfPageWidth({
        containerWidth: 1000,
        containerHeight: 700,
        pageAspectRatio: 8.5 / 11,
        thumbnailsOpen: true,
        fitMode: "width",
        zoom: 1,
      }),
    ).toBe(820);
    expect(
      pdfPageWidth({
        containerWidth: 1000,
        containerHeight: 700,
        pageAspectRatio: 8.5 / 11,
        thumbnailsOpen: false,
        fitMode: "page",
        zoom: 1,
      }),
    ).toBe(504);
  });
});
