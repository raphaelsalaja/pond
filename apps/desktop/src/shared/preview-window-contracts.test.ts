import { DEFAULT_PREFS } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import {
  PreviewFileActionSchema,
  PreviewNeighborRequestSchema,
  PreviewWindowConfigureSchema,
  PreviewWindowOpenSchema,
  PreviewWindowStateSchema,
  previewMediaProfile,
  previewMediaType,
} from "./preview-window-contracts";

describe("preview window contracts", () => {
  it("recognizes video originals and excludes generated posters and unsupported files", () => {
    expect(previewMediaType({ kind: "video", path: "clip.mov" })).toBe("video");
    expect(
      previewMediaType({ kind: "file", path: "clip", mimeType: "video/mp4" }),
    ).toBe("video");
    expect(previewMediaType({ kind: "poster", path: "poster.jpg" })).toBeNull();
    expect(previewMediaType({ kind: "file", path: "document.pdf" })).toBeNull();
  });

  it("keeps the original identity while classifying generated raster sources", () => {
    expect(previewMediaProfile({ kind: "file", path: "photo.heic" })).toEqual({
      mediaType: "image",
      source: "generated",
    });
    expect(previewMediaProfile({ kind: "file", path: "capture.dng" })).toEqual({
      mediaType: "image",
      source: "generated",
    });
    expect(previewMediaProfile({ kind: "file", path: "layout.psd" })).toEqual({
      mediaType: "image",
      source: "generated",
    });
    expect(previewMediaProfile({ kind: "file", path: "photo.jpeg" })).toEqual({
      mediaType: "image",
      source: "original",
    });
  });

  it("bounds original-file actions to the active preview window", () => {
    expect(
      PreviewFileActionSchema.parse({ windowId: 4, action: "open" }),
    ).toEqual({ windowId: 4, action: "open" });
    expect(() =>
      PreviewFileActionSchema.parse({ windowId: 4, action: "delete" }),
    ).toThrow();
  });
  it("migrates older viewer preferences to parity defaults", () => {
    expect(DEFAULT_PREFS.viewer).toMatchObject({
      defaultImageSize: "fit",
      gifAutoplay: true,
      thumbnailBehavior: "scrub",
      thumbnailQuality: "balanced",
      hoverZoom: false,
      videoWheelBehavior: "progress",
      videoMuted: false,
      doubleClickAction: "open",
      middleClickAction: "open",
      spaceAction: "preview",
    });
  });

  it("accepts presentation and detached image requests", () => {
    expect(
      PreviewWindowOpenSchema.parse({
        saveId: "save",
        fileIndex: 2,
        kind: "detached",
      }),
    ).toEqual({ saveId: "save", fileIndex: 2, kind: "detached" });
  });

  it("bounds privileged window configuration", () => {
    expect(() =>
      PreviewWindowConfigureSchema.parse({ windowId: 4, opacity: 0.1 }),
    ).toThrow();
    expect(
      PreviewWindowConfigureSchema.parse({
        windowId: 4,
        opacity: 0.75,
        rotation: 270,
        mirrored: true,
        grayscale: true,
        size: "actual",
        zoom: 2,
      }),
    ).toMatchObject({ opacity: 0.75, rotation: 270, zoom: 2 });
    expect(() =>
      PreviewWindowConfigureSchema.parse({ windowId: 4, zoom: 9 }),
    ).toThrow();
  });

  it("limits neighbor requests to adjacent directions", () => {
    expect(
      PreviewNeighborRequestSchema.parse({
        windowId: 4,
        saveId: "save",
        delta: -1,
      }).delta,
    ).toBe(-1);
    expect(() =>
      PreviewNeighborRequestSchema.parse({
        windowId: 4,
        saveId: "save",
        delta: 2,
      }),
    ).toThrow();
  });

  it("requires the complete lifecycle state sent to auxiliary renderers", () => {
    expect(
      PreviewWindowStateSchema.safeParse({
        windowId: 4,
        saveId: "save",
        fileIndex: 0,
        kind: "presentation",
        title: "Reference",
        url: "pond://save/image.png",
        originalPath: "image.png",
        mediaType: "image",
        source: "original",
        reduceMotion: "system",
        fullscreen: true,
        opacity: 1,
        alwaysOnTop: false,
        rotation: 0,
        mirrored: false,
        grayscale: false,
        size: "fit",
        zoom: null,
        videoMuted: false,
      }).success,
    ).toBe(true);
  });
});
