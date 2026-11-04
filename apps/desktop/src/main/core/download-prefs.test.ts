import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_VIDEO_DOWNLOAD,
} from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import {
  imageSourceOverrides,
  normalizeImage,
  normalizeVideo,
  resolveImage,
  resolveVideo,
  videoSourceOverrides,
} from "./download-prefs";

describe("normalizeVideo", () => {
  it("defaults autoDownload to off", () => {
    expect(normalizeVideo({}).autoDownload).toBe(false);
  });

  it("ignores the retired enabled flag", () => {
    expect(normalizeVideo(JSON.parse('{"enabled":true}')).autoDownload).toBe(
      false,
    );
  });
});

describe("video source overrides", () => {
  it("keeps only known sources and drops invalid values", () => {
    const stored = JSON.stringify({
      ...DEFAULT_VIDEO_DOWNLOAD,
      sources: {
        youtube: { maxHeight: 720, videoCodec: "nope" },
        myspace: { maxHeight: 144 },
      },
    });
    const overrides = videoSourceOverrides(JSON.parse(stored));
    expect(overrides).toEqual({ youtube: { maxHeight: 720 } });
  });

  it("resolves a source on top of the global settings", () => {
    const global = normalizeVideo({
      maxHeight: 1080,
      videoCodec: "av1",
      autoDownload: false,
    });
    const resolved = resolveVideo(
      global,
      { youtube: { autoDownload: true, maxHeight: 700 } },
      "youtube",
    );
    expect(resolved.autoDownload).toBe(true);
    expect(resolved.maxHeight).toBe(720);
    expect(resolved.videoCodec).toBe("av1");
  });

  it("falls back to global for sources without an override", () => {
    const global = normalizeVideo({ autoDownload: true });
    expect(resolveVideo(global, {}, "twitter")).toEqual(global);
    expect(resolveVideo(global, {}, null)).toEqual(global);
  });
});

describe("image source overrides", () => {
  it("resolves per source", () => {
    const overrides = imageSourceOverrides({
      ...DEFAULT_IMAGE_DOWNLOAD,
      sources: { pinterest: { format: "webp" } },
    });
    const resolved = resolveImage(
      DEFAULT_IMAGE_DOWNLOAD,
      overrides,
      "pinterest",
    );
    expect(resolved.format).toBe("webp");
    expect(resolved.maxLongEdge).toBe(DEFAULT_IMAGE_DOWNLOAD.maxLongEdge);
  });

  it("splits carousels only where it's turned on", () => {
    expect(normalizeImage({}).splitPosts).toBe(false);
    const overrides = imageSourceOverrides({
      ...DEFAULT_IMAGE_DOWNLOAD,
      sources: { instagram: { splitPosts: true } },
    });
    const global = normalizeImage({});
    expect(resolveImage(global, overrides, "instagram").splitPosts).toBe(true);
    expect(resolveImage(global, overrides, "twitter").splitPosts).toBe(false);
  });
});
