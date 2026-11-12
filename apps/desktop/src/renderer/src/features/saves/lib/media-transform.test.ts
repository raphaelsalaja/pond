import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { orientedThumbStyle } from "./media-transform";

function save(rotate: number): Save {
  return {
    id: "image",
    url: "https://example.com",
    title: null,
    description: null,
    author: null,
    notes: null,
    source: "web",
    sourceId: "",
    accountId: null,
    mediaUrl: null,
    mediaType: "image",
    fileSize: null,
    width: 1200,
    height: 800,
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    coverIndex: 0,
    files: [],
    tags: [],
    rotate,
  };
}

describe("orientedThumbStyle", () => {
  it("sizes a quarter-turned image to the pixel box so it fills the swapped tile", () => {
    const style = orientedThumbStyle(save(90), 1200 / 800);
    expect(style.position).toBe("absolute");
    expect(style.left).toBe("50%");
    expect(style.top).toBe("50%");
    expect(style.width).toBe("150%");
    expect(style.height).toBe("auto");
    expect(style.aspectRatio).toBe("1.5");
    expect(style.transform).toBe("translate(-50%, -50%) rotate(90deg)");
  });

  it("keeps an upright rotation in the tile's own box", () => {
    const style = orientedThumbStyle(save(180), 1200 / 800);
    expect(style.width).toBeUndefined();
    expect(style.transform).toBe("rotate(180deg)");
  });

  it("flips in pixel space before the quarter turn", () => {
    const flipped = { ...save(270), flipX: true };
    expect(orientedThumbStyle(flipped, 1200 / 800).transform).toBe(
      "translate(-50%, -50%) rotate(270deg) scaleX(-1)",
    );
  });
});
