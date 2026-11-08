import type { DownloadSingleProbe } from "@shared/downloader-contracts";
import { describe, expect, it } from "vitest";
import {
  estimateByDuration,
  estimateSingle,
  qualityLabel,
  videoOptionFor,
} from "./estimate";

const probe: DownloadSingleProbe = {
  kind: "single",
  url: "https://www.youtube.com/watch?v=abc",
  source: "youtube",
  site: "YouTube",
  title: "A talk",
  author: null,
  duration: 200,
  thumbnail: null,
  isLive: false,
  heatmap: [],
  chapters: [],
  storyboard: null,
  audioSize: 3_000_000,
  videoOptions: [
    { height: 2160, fps: 30, size: 240_000_000 },
    { height: 1080, fps: 30, size: 34_000_000 },
    { height: 720, fps: 30, size: null },
  ],
  captions: [],
  preview: null,
  existingSaveId: null,
};

const base = {
  mode: "video" as const,
  maxHeight: null,
  audioFormat: "mp3" as const,
  range: null,
};

describe("videoOptionFor", () => {
  it("picks the tallest option under the cap", () => {
    expect(videoOptionFor(probe, null)?.height).toBe(2160);
    expect(videoOptionFor(probe, 1440)?.height).toBe(1080);
    expect(videoOptionFor(probe, 144)?.height).toBe(720);
  });
});

describe("estimateSingle", () => {
  it("scales the reported size by the trimmed share", () => {
    expect(estimateSingle(probe, { ...base, maxHeight: 1080 })).toBe(
      34_000_000,
    );
    expect(
      estimateSingle(probe, {
        ...base,
        maxHeight: 1080,
        range: { start: 0, end: 50 },
      }),
    ).toBe(8_500_000);
  });

  it("falls back to a typical bitrate when the site reports no size", () => {
    expect(estimateSingle(probe, { ...base, maxHeight: 720 })).toBe(20_000_000);
  });

  it("estimates audio by format", () => {
    expect(
      estimateSingle(probe, { ...base, mode: "audio", audioFormat: "m4a" }),
    ).toBe(3_000_000);
    expect(estimateSingle(probe, { ...base, mode: "audio" })).toBe(6_125_000);
  });

  it("skips transcripts", () => {
    expect(estimateSingle(probe, { ...base, mode: "transcript" })).toBeNull();
  });
});

describe("estimateByDuration", () => {
  it("needs a length", () => {
    expect(estimateByDuration(null, base)).toBeNull();
    expect(estimateByDuration(100, { ...base, maxHeight: 1080 })).toBe(
      16_250_000,
    );
  });
});

describe("qualityLabel", () => {
  it("names the big ones", () => {
    expect(qualityLabel(4320)).toBe("8K");
    expect(qualityLabel(2160)).toBe("4K");
    expect(qualityLabel(1080)).toBe("1080p");
  });
});
