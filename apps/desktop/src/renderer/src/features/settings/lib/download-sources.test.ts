import { describe, expect, it } from "vitest";
import {
  hasSourceOverrides,
  imageDownloadValues,
  missingVideosDescription,
  queuedVideosTitle,
  sourceSectionId,
  videoDownloadValues,
} from "./download-sources";
import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_VIDEO_DOWNLOAD,
} from "./section-types";
import type { DownloadSettings } from "./section-types";

const settings: DownloadSettings = {
  videoDownload: { ...DEFAULT_VIDEO_DOWNLOAD, maxHeight: 720 },
  imageDownload: { ...DEFAULT_IMAGE_DOWNLOAD, format: "webp" },
  videoDownloadSources: {
    youtube: { autoDownload: true, maxHeight: 2160 },
    tiktok: {},
  },
  imageDownloadSources: { pinterest: { format: "png" } },
};

describe("download values", () => {
  it("uses the global values without a source", () => {
    expect(videoDownloadValues(settings)).toEqual({
      ...settings.videoDownload,
      followsGlobal: false,
    });
    expect(imageDownloadValues(settings)).toEqual({
      ...settings.imageDownload,
      followsGlobal: false,
    });
  });

  it("merges a source override over the global values", () => {
    expect(videoDownloadValues(settings, "youtube")).toMatchObject({
      autoDownload: true,
      maxHeight: 2160,
      videoCodec: DEFAULT_VIDEO_DOWNLOAD.videoCodec,
      followsGlobal: false,
    });
    expect(imageDownloadValues(settings, "pinterest")).toMatchObject({
      format: "png",
      maxLongEdge: DEFAULT_IMAGE_DOWNLOAD.maxLongEdge,
      followsGlobal: false,
    });
  });

  it("shows global values on a source that follows global", () => {
    expect(videoDownloadValues(settings, "reddit")).toEqual({
      ...settings.videoDownload,
      followsGlobal: true,
    });
    expect(imageDownloadValues(settings, "reddit")).toEqual({
      ...settings.imageDownload,
      followsGlobal: true,
    });
  });

  it("unlocks both kinds when only one kind has an override", () => {
    expect(videoDownloadValues(settings, "pinterest")).toEqual({
      ...settings.videoDownload,
      followsGlobal: false,
    });
    expect(imageDownloadValues(settings, "youtube").followsGlobal).toBe(false);
  });

  it("treats an empty override as custom with global values", () => {
    expect(videoDownloadValues(settings, "tiktok")).toEqual({
      ...settings.videoDownload,
      followsGlobal: false,
    });
  });
});

describe("source status", () => {
  it("detects sources with overrides of either kind", () => {
    expect(hasSourceOverrides(settings, "youtube")).toBe(true);
    expect(hasSourceOverrides(settings, "pinterest")).toBe(true);
    expect(hasSourceOverrides(settings, "tiktok")).toBe(true);
    expect(hasSourceOverrides(settings, "reddit")).toBe(false);
  });

  it("names the child settings section under Harvesting", () => {
    expect(sourceSectionId("youtube")).toBe("sources-youtube");
  });
});

describe("missing video copy", () => {
  it("counts video saves without a video file", () => {
    expect(missingVideosDescription(0)).toBe(
      "All video saves have a video file.",
    );
    expect(missingVideosDescription(1)).toBe(
      "1 video save doesn't have a video file.",
    );
    expect(missingVideosDescription(12)).toBe(
      "12 video saves don't have a video file.",
    );
  });

  it("titles the queued toast", () => {
    expect(queuedVideosTitle(0)).toBe("No videos to download");
    expect(queuedVideosTitle(1)).toBe("Downloading 1 video");
    expect(queuedVideosTitle(5)).toBe("Downloading 5 videos");
  });
});
