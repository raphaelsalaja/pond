import { EAGLE_DETAIL_VIEW_EXTENSIONS } from "@shared/eagle-detail-view-formats";
import { describe, expect, it } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import { viewerCapabilityFor } from "./viewer-capability";
import type { ViewerCapability } from "./viewer-capability";
import { buildViewerItems } from "./viewer-item";

const TERMINAL_PROVIDER_BY_SURFACE = {
  raster: "media-slide",
  temporal: "media-slide",
  specialist: "stored-file-content",
  fallback: "viewer-fallback",
} as const satisfies Record<ViewerCapability["surface"], string>;

function file(extension: string): SaveFile {
  return {
    kind: "file",
    path: `gallery.${extension}`,
    sha256: "gallery",
    size: 1,
  };
}

function save(extension: string): Save {
  return {
    id: `eagle-gallery-${extension}`,
    source: "local",
    sourceId: `eagle-gallery-${extension}`,
    url: `https://example.test/gallery.${extension}`,
    title: `Eagle gallery .${extension}`,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "file",
    files: [file(extension)],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("Eagle Format Gallery viewers", () => {
  it.each([
    ["png", "raster", "original"],
    ["dng", "raster", "generated"],
    ["docx", "raster", "generated"],
    ["mp4", "temporal", undefined],
    ["pdf", "specialist", undefined],
  ] as const)(
    "describes .%s with its %s interaction surface",
    (extension, surface, source) => {
      const capability = viewerCapabilityFor(file(extension));
      expect(capability).toMatchObject({ surface });
      if (source) {
        expect(capability).toMatchObject({ source });
      }
    },
  );

  it.each([...EAGLE_DETAIL_VIEW_EXTENSIONS])(
    "routes observed .%s files to a stable nonblank terminal viewer",
    (extension) => {
      const items = buildViewerItems(save(extension));
      expect(items).toHaveLength(1);

      const item = items[0];
      expect(item).toBeDefined();
      expect(item?.fileIndex).toBe(0);
      expect(item?.capability.originalActions).toBe(true);
      expect(
        item
          ? TERMINAL_PROVIDER_BY_SURFACE[item.capability.surface]
          : undefined,
      ).toBeDefined();
    },
  );

  it.each([
    ["jpg", "media"],
    ["heic", "media"],
    ["psd", "native-preview"],
    ["dng", "native-preview"],
    ["mp4", "media"],
    ["wav", "audio"],
    ["pdf", "pdf"],
    ["docx", "native-preview"],
    ["xlsx", "native-preview"],
    ["pptx", "native-preview"],
    ["woff2", "font"],
    ["glb", "model"],
    ["amf", "model"],
    ["usdc", "model"],
    ["usdz", "model"],
    ["vtk", "model"],
    ["epub", "epub"],
    ["zip", "archive"],
    ["html", "safe-web"],
    ["md", "text"],
    ["css", "text"],
    ["java", "text"],
    ["js", "text"],
    ["py", "text"],
    ["rs", "text"],
    ["sql", "text"],
    ["ts", "text"],
  ])("routes .%s through %s", (extension, expected) => {
    expect(viewerCapabilityFor(file(extension)).kind).toBe(expected);
  });
});
