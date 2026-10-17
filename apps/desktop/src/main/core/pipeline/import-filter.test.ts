import type { Capture } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { capturedTraits } from "./import-filter";

function withCapture(capture: Partial<Capture>) {
  return {
    mediaType: null,
    publishedAt: null,
    rawJson: {
      capture: {
        id: "1",
        source: "reddit" as const,
        url: "https://www.reddit.com/r/pond/comments/1",
        media: [],
        ...capture,
      },
      extractorId: "test",
      extractedAt: "2026-10-17T00:00:00.000Z",
    },
  };
}

describe("capturedTraits", () => {
  it("treats a post with only a link card as text", () => {
    expect(
      capturedTraits(
        withCapture({
          media: [{ url: "https://example.com/card.png", type: "link" }],
        }),
      ).mediaType,
    ).toBeNull();
  });

  it("reads the majority media kind and the publish date", () => {
    expect(
      capturedTraits(
        withCapture({
          publishedAt: "2026-01-02T03:04:05.000Z",
          media: [
            { url: "https://example.com/a.mp4", type: "video" },
            { url: "https://example.com/b.mp4", type: "video" },
            { url: "https://example.com/c.png", type: "image" },
          ],
        }),
      ),
    ).toEqual({
      mediaType: "video",
      publishedAt: new Date("2026-01-02T03:04:05.000Z"),
    });
  });

  it("falls back to the save's columns without a capture", () => {
    const publishedAt = new Date("2025-05-05T00:00:00.000Z");
    expect(
      capturedTraits({ mediaType: "image", publishedAt, rawJson: null }),
    ).toEqual({ mediaType: "image", publishedAt });
  });
});
