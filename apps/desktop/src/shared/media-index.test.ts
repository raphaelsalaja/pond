import { describe, expect, it } from "vitest";
import { CARD_INDEX_WIDTHS, isStaticThumbnailFile } from "./media-index";

describe("media thumbnail contract", () => {
  it("keeps the LQIP and final card cache buckets in one order", () => {
    expect(CARD_INDEX_WIDTHS).toEqual([32, 768]);
  });

  it("accepts supported stills and legacy extensionless covers", () => {
    expect(
      isStaticThumbnailFile({
        kind: "image",
        path: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    ).toBe(true);
    expect(
      isStaticThumbnailFile({ kind: "cover", path: "cover.", mimeType: "" }),
    ).toBe(true);
  });

  it("rejects animated, vector, and unsupported raster formats", () => {
    expect(
      isStaticThumbnailFile({
        kind: "image",
        path: "animation.gif",
        mimeType: "image/gif",
      }),
    ).toBe(false);
    expect(
      isStaticThumbnailFile({
        kind: "image",
        path: "graphic.svg",
        mimeType: "image/svg+xml",
      }),
    ).toBe(false);
    expect(
      isStaticThumbnailFile({
        kind: "image",
        path: "bitmap.bmp",
        mimeType: "image/bmp",
      }),
    ).toBe(false);
  });
});
