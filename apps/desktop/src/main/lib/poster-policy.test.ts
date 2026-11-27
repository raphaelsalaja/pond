import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import {
  needsPosterRepair,
  posterFilename,
  platformPosterUrl,
  posterRepairIndexes,
  remotePosterUrl,
  usesPlatformPoster,
  videoFilename,
} from "./poster-policy";

function file(
  kind: SaveFile["kind"],
  path: string,
  dims?: { width: number; height: number },
): SaveFile {
  const file: SaveFile = {
    kind,
    path,
    sha256: "",
    size: 0,
    mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
  };
  if (dims) {
    file.width = dims.width;
    file.height = dims.height;
  }
  return file;
}

describe("usesPlatformPoster", () => {
  it("is true for sources whose posters are platform covers", () => {
    expect(usesPlatformPoster("youtube")).toBe(true);
    expect(usesPlatformPoster("instagram")).toBe(true);
    expect(usesPlatformPoster("tiktok")).toBe(false);
    expect(usesPlatformPoster(null)).toBe(false);
  });
});

describe("media filenames", () => {
  it("numbers the first slot from 1", () => {
    expect(videoFilename(0, ".mp4")).toBe("video-1.mp4");
    expect(videoFilename(1, ".mp4")).toBe("video-2.mp4");
    expect(posterFilename(0, ".jpg")).toBe("poster-1.jpg");
    expect(posterFilename(1, ".jpg")).toBe("poster-2.jpg");
  });
});

describe("needsPosterRepair", () => {
  it("repairs missing posters", () => {
    expect(needsPosterRepair([file("video", "video.mp4")])).toBe(true);
  });

  it("keeps existing posters even when aspects disagree", () => {
    expect(
      needsPosterRepair([
        file("video", "video.mp4", { width: 1080, height: 1920 }),
        file("poster", "poster.jpg", { width: 1280, height: 720 }),
      ]),
    ).toBe(false);
  });

  it("keeps undimmed existing posters", () => {
    expect(
      needsPosterRepair([
        file("video", "video.mp4"),
        file("poster", "poster.jpg"),
      ]),
    ).toBe(false);
  });

  it("returns only missing poster indexes", () => {
    expect(
      posterRepairIndexes([
        file("video", "a.mp4", { width: 1920, height: 1080 }),
        file("video", "b.mp4", { width: 1080, height: 1920 }),
        file("poster", "poster.jpg", { width: 1280, height: 720 }),
      ]),
    ).toEqual([1]);
  });
});

describe("platformPosterUrl legacy YouTube lookup", () => {
  it("prefers ytdlp thumbnail then capture posterUrl", () => {
    expect(
      platformPosterUrl(
        storedAsRawJson({
          ytdlp: { thumbnail: "https://i.ytimg.com/vi/x/hqdefault.jpg" },
        }),
      ),
    ).toBe("https://i.ytimg.com/vi/x/hqdefault.jpg");
    expect(
      platformPosterUrl(
        storedAsRawJson({
          capture: {
            media: [
              {
                url: "https://video.example/y.mp4",
                type: "video",
                posterUrl: "https://i.ytimg.com/vi/y/hqdefault.jpg",
              },
            ],
          },
        }),
      ),
    ).toBe("https://i.ytimg.com/vi/y/hqdefault.jpg");
  });
});

describe("platformPosterUrl", () => {
  it("uses the poster for the matching carousel video slot", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [
          { type: "image", url: "https://cdn.test/image.jpg" },
          {
            type: "video",
            url: "https://cdn.test/first.mp4",
            posterUrl: "https://cdn.test/first-cover.jpg",
          },
          {
            type: "video",
            url: "https://cdn.test/second.mp4",
            posterUrl: "https://cdn.test/second-cover.jpg",
          },
        ],
      },
    });

    expect(platformPosterUrl(rawJson, 0)).toBe(
      "https://cdn.test/first-cover.jpg",
    );
    expect(platformPosterUrl(rawJson, 1)).toBe(
      "https://cdn.test/second-cover.jpg",
    );
  });

  it("does not reuse a later carousel poster when the first video has none", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [
          { type: "video", url: "https://cdn.test/first.mp4" },
          {
            type: "video",
            url: "https://cdn.test/second.mp4",
            posterUrl: "https://cdn.test/second-cover.jpg",
          },
        ],
      },
    });

    expect(platformPosterUrl(rawJson, 0)).toBeNull();
    expect(platformPosterUrl(rawJson, 1)).toBe(
      "https://cdn.test/second-cover.jpg",
    );
  });

  it("does not reuse the first carousel poster for a later video without one", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [
          {
            type: "video",
            url: "https://cdn.test/first.mp4",
            posterUrl: "https://cdn.test/first-cover.jpg",
          },
          { type: "video", url: "https://cdn.test/second.mp4" },
        ],
      },
    });

    expect(platformPosterUrl(rawJson, 1)).toBeNull();
  });
});

describe("remotePosterUrl", () => {
  it("prefers a captured posterUrl", () => {
    const rawJson = storedAsRawJson({
      ytdlp: { thumbnail: "https://i.ytimg.com/vi/x/hqdefault.jpg" },
      capture: {
        media: [
          {
            type: "video",
            url: "https://x.test/v.mp4",
            posterUrl: "https://x.test/p.jpg",
          },
        ],
      },
    });
    expect(remotePosterUrl(rawJson, null)).toBe("https://x.test/p.jpg");
  });

  it("finds a posterUrl on quoted media", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [],
        quoted: {
          id: "q",
          source: "twitter",
          url: "https://x.com/a/status/1",
          media: [
            {
              type: "video",
              url: "https://x.test/q.mp4",
              posterUrl: "https://x.test/q.jpg",
            },
          ],
        },
      },
    });
    expect(remotePosterUrl(rawJson, null)).toBe("https://x.test/q.jpg");
  });

  it("uses the ytdlp thumbnail when no posterUrl was captured", () => {
    const rawJson = storedAsRawJson({
      ytdlp: { thumbnail: "https://i.ytimg.com/vi/x/hqdefault.jpg" },
      capture: { media: [{ type: "video", url: "https://x.test/v.mp4" }] },
    });
    expect(remotePosterUrl(rawJson, null)).toBe(
      "https://i.ytimg.com/vi/x/hqdefault.jpg",
    );
  });

  it("uses an image URL stored as the video entry", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [{ type: "video", url: "https://cdn.test/frame.jpg?x=1" }],
      },
    });
    expect(remotePosterUrl(rawJson, null)).toBe(
      "https://cdn.test/frame.jpg?x=1",
    );
  });

  it("falls back to an image mediaUrl", () => {
    const rawJson = storedAsRawJson({
      capture: {
        media: [{ type: "video", url: "https://www.tiktok.com/@a/video/1" }],
      },
    });
    expect(remotePosterUrl(rawJson, "https://cdn.test/og.webp")).toBe(
      "https://cdn.test/og.webp",
    );
    expect(remotePosterUrl(rawJson, "https://cdn.test/clip.mp4")).toBeNull();
  });

  it("returns null for saves without captured video", () => {
    const rawJson = storedAsRawJson({
      capture: { media: [{ type: "image", url: "https://cdn.test/a.jpg" }] },
    });
    expect(remotePosterUrl(rawJson, "https://cdn.test/a.jpg")).toBeNull();
    expect(remotePosterUrl(null, "https://cdn.test/a.jpg")).toBeNull();
  });
});
