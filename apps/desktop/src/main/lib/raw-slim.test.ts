import type { RawJson } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { slimRawJson } from "./raw-slim";

function rawWith(extras: RawJson["capture"]["extras"]): RawJson {
  return {
    capture: {
      id: "c1",
      source: "web",
      url: "https://shop.example.com/item",
      media: [],
      extras,
    },
    extractorId: "web",
    extractedAt: "2026-10-27T00:00:00.000Z",
  };
}

describe("slimRawJson", () => {
  it("keeps the product flag so the renderer can label shop links", () => {
    const slim = slimRawJson(
      rawWith({
        product: true,
        publisher: "Shop",
        faviconUrl: "https://x/f.png",
      }),
    );
    expect(slim?.capture.extras).toEqual({ product: true });
  });

  it("drops extras for pages that are not products", () => {
    const slim = slimRawJson(rawWith({ publisher: "Blog" }));
    expect(slim?.capture.extras).toBeUndefined();
  });

  it("keeps split provenance so sync can match a slide to its post", () => {
    const slim = slimRawJson({
      ...rawWith(undefined),
      split: { sourceId: "post-1", media: [2] },
    });
    expect(slim?.split).toEqual({ sourceId: "post-1", media: [2] });
  });
});
