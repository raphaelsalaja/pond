import type { RawJson } from "@pond/schema/raw";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import type { StoredRawJsonInput } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import { countCaptureVideos, expectedVideoDownloads, planOps } from "./specs";

/** Older stored rows hold partial captures; tolerating them is the promise under test. */
function storedRawJson(value: StoredRawJsonInput): RawJson {
  return storedAsRawJson(structuredClone(value));
}

describe("planOps", () => {
  it("captures Threads and Bluesky posts like tweets and skips text covers", () => {
    const ops = planOps("threads");
    expect(ops).toContain("capture_tweet");
    expect(ops).not.toContain("render_text_cover");
    expect(ops).not.toContain("archive_page");
    expect(planOps("twitter")).toEqual(ops);
    expect(planOps("bluesky")).toEqual(ops);
  });
});

describe("expectedVideoDownloads", () => {
  it("counts every capture.media video, including quoted clips", () => {
    expect(
      countCaptureVideos(
        storedRawJson({
          capture: {
            media: [
              { type: "video", url: "https://video.twimg.com/a.mp4" },
              { type: "image", url: "https://pbs.twimg.com/b.jpg" },
            ],
            quoted: {
              id: "q",
              source: "twitter",
              url: "https://x.com/b/status/2",
              media: [{ type: "video", url: "https://video.twimg.com/c.mp4" }],
            },
          },
        }),
      ),
    ).toBe(2);
    expect(
      expectedVideoDownloads({
        mediaType: "video",
        rawJson: storedRawJson({
          capture: {
            media: [{ type: "video", url: "https://video.twimg.com/a.mp4" }],
            quoted: {
              id: "q",
              source: "twitter",
              url: "https://x.com/b/status/2",
              media: [{ type: "video", url: "https://video.twimg.com/c.mp4" }],
            },
          },
        }),
      }),
    ).toBe(2);
  });

  it("falls back to one when mediaType is video and capture lists none", () => {
    expect(
      expectedVideoDownloads({
        mediaType: "video",
        rawJson: storedRawJson({}),
      }),
    ).toBe(1);
    expect(
      expectedVideoDownloads({
        mediaType: "image",
        rawJson: storedRawJson({}),
      }),
    ).toBe(0);
  });
});
