import type { PreviewWindowState } from "@shared/preview-window-contracts";
import { describe, expect, it } from "vitest";
import {
  buildPreviewContextMenuItems,
  previewTargetForFile,
} from "./preview-windows";

const state: PreviewWindowState = {
  windowId: 4,
  saveId: "save",
  fileIndex: 0,
  kind: "detached",
  title: "Reference",
  reduceMotion: "system",
  url: "pond://save/reference.png",
  originalPath: "reference.png",
  mediaType: "image",
  source: "original",
  fullscreen: false,
  opacity: 1,
  alwaysOnTop: true,
  rotation: 0,
  mirrored: false,
  grayscale: false,
  size: "fit",
  zoom: null,
  videoMuted: false,
};

describe("preview context menu", () => {
  it("offers fullscreen and keep on top for video without image transforms", () => {
    const items = buildPreviewContextMenuItems({
      ...state,
      mediaType: "video",
    });
    const labels = items.flatMap((item) =>
      "label" in item ? [item.label] : [],
    );
    expect(labels).toContain("Fullscreen");
    expect(labels).toContain("Keep on Top");
    expect(labels).toContain("Fill");
    expect(labels).toContain("Fit");
    expect(labels).not.toContain("Mirror");
    expect(labels).not.toContain("Grayscale");
    expect(labels).not.toContain("100%");
  });
  it("checks fit, zoom ratios, and detached window state", () => {
    const items = buildPreviewContextMenuItems(state);
    const fit = items.find((item) => "label" in item && item.label === "Fit");
    const actual = items.find(
      (item) => "label" in item && item.label === "100%",
    );
    const pinned = items.find(
      (item) => "label" in item && item.label === "Keep on Top",
    );
    expect(fit).toMatchObject({ checked: true });
    expect(actual).toMatchObject({ checked: false });
    expect(pinned).toMatchObject({ checked: true });
  });
});

describe("preview targets", () => {
  it("keeps JPEG originals direct and marks HEIC and RAW display sources generated", () => {
    const input = {
      saveId: "save",
      title: "Reference",
      kind: "detached" as const,
    };
    expect(
      previewTargetForFile({
        ...input,
        file: { kind: "file", path: "photo.jpeg" },
      }),
    ).toMatchObject({
      originalPath: "photo.jpeg",
      source: "original",
      url: "pond://save/photo.jpeg",
    });
    expect(
      previewTargetForFile({
        ...input,
        file: { kind: "file", path: "photo.heic" },
      }),
    ).toMatchObject({ originalPath: "photo.heic", source: "generated" });
    expect(
      previewTargetForFile({
        ...input,
        file: { kind: "file", path: "capture.dng" },
      }),
    ).toMatchObject({ originalPath: "capture.dng", source: "generated" });
    expect(
      previewTargetForFile({
        ...input,
        file: { kind: "file", path: "brief.docx" },
      }),
    ).toMatchObject({ originalPath: "brief.docx", source: "generated" });
  });

  it("keeps videos out of presentation windows", () => {
    expect(
      previewTargetForFile({
        saveId: "save",
        title: "Clip",
        kind: "presentation",
        file: { kind: "video", path: "clip.mp4" },
      }),
    ).toBeNull();
  });
});
