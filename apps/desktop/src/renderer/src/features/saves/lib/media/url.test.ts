import { THUMBNAIL_CACHE_VERSION } from "@shared/media-index";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveFile } from "@/features/saves/types";
import {
  buildPondUrl,
  pondFileUrl,
  sharperThumbUrlFor,
  thumbUrlFor,
} from "./url";

function file(path: string, sha256 = ""): SaveFile {
  return { kind: "image", path, sha256, size: 10 };
}

describe("pondFileUrl", () => {
  it("encodes spaces so the pond protocol keeps one path segment", () => {
    expect(
      pondFileUrl(
        "01M6G9W0KWQJNCXVE71HCTPDDS",
        "Screenshot From 2026-10-30 08-21-58.png",
      ),
    ).toBe(
      "pond://01M6G9W0KWQJNCXVE71HCTPDDS/Screenshot%20From%202026-10-30%2008-21-58.png",
    );
  });

  it("encodes fragments, queries, and percent signs", () => {
    expect(pondFileUrl("01ABC", "draft #2 100%.png?raw=1")).toBe(
      "pond://01ABC/draft%20%232%20100%25.png%3Fraw%3D1",
    );
  });

  it("keeps subfolder separators intact", () => {
    expect(pondFileUrl("01ABC", "preview/frames/01.png")).toBe(
      "pond://01ABC/preview/frames/01.png",
    );
  });
});

describe("buildPondUrl", () => {
  it("encodes the file path and appends the cache buster", () => {
    expect(buildPondUrl("01ABC", file("a b.png", "abcdef1234567890"))).toBe(
      "pond://01ABC/a%20b.png?v=abcdef123456",
    );
  });

  it("omits the cache buster when there is no sha256", () => {
    expect(buildPondUrl("01ABC", file("a b.png"))).toBe(
      "pond://01ABC/a%20b.png",
    );
  });
});

describe("thumbnail widths", () => {
  const original = "pond://01ABC/photo.png?v=abcdef123456";
  const widthOf = (url: string) => new URL(url).searchParams.get("tw");

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the bucket that covers the card", () => {
    expect(thumbUrlFor(original, 400)).toBe(
      `${original}&tw=512&tv=${THUMBNAIL_CACHE_VERSION}`,
    );
  });

  it("sharpens one bucket above the card thumbnail", () => {
    expect(widthOf(sharperThumbUrlFor(original, 400))).toBe("768");
    expect(widthOf(sharperThumbUrlFor(original, 1100))).toBe("2048");
  });

  it("scales the sharper bucket with the display density", () => {
    vi.stubGlobal("devicePixelRatio", 2);

    expect(widthOf(thumbUrlFor(original, 384))).toBe("768");
    expect(widthOf(sharperThumbUrlFor(original, 384))).toBe("1024");
  });

  it("never asks for more than the largest thumbnail main renders", () => {
    vi.stubGlobal("devicePixelRatio", 2);

    expect(widthOf(sharperThumbUrlFor(original, 1600))).toBe("2048");
    expect(sharperThumbUrlFor(original, 1600)).not.toBe(original);
  });
});
