import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import {
  aspectDimsFor,
  clampRatio,
  layoutAspectFor,
  recordAspect,
} from "./aspect";

function save(partial: Partial<Save> & { id: string }): Save {
  return {
    url: "https://example.com",
    title: null,
    description: null,
    author: null,
    notes: null,
    source: "web",
    sourceId: "",
    accountId: null,
    mediaUrl: null,
    mediaType: null,
    fileSize: null,
    width: null,
    height: null,
    savedAt: Date.now(),
    createdAt: Date.now(),
    deletedAt: null,
    coverIndex: 0,
    files: [],
    tags: [],
    ...partial,
  };
}

describe("aspectDimsFor", () => {
  it("prefers video dims over poster dims", () => {
    const result = aspectDimsFor(
      save({
        id: "a",
        files: [
          {
            path: "video.mp4",
            kind: "video",
            mimeType: "video/mp4",
            sha256: "",
            size: 0,
            width: 480,
            height: 854,
          },
          {
            path: "poster.jpg",
            kind: "poster",
            mimeType: "image/jpeg",
            sha256: "",
            size: 0,
            width: 1280,
            height: 720,
          },
        ],
      }),
    );
    expect(result).toEqual({ w: 480, h: 854 });
  });

  it("falls back to save dims when the video omits them, never the poster", () => {
    const result = aspectDimsFor(
      save({
        id: "b",
        width: 480,
        height: 854,
        files: [
          {
            path: "video.mp4",
            kind: "video",
            mimeType: "video/mp4",
            sha256: "",
            size: 0,
            width: null,
            height: null,
          },
          {
            path: "poster.jpg",
            kind: "poster",
            mimeType: "image/jpeg",
            sha256: "",
            size: 0,
            width: 1280,
            height: 720,
          },
        ],
      }),
    );
    expect(result).toEqual({ w: 480, h: 854 });
  });

  it("does not use poster dims for video cards", () => {
    const result = aspectDimsFor(
      save({
        id: "c",
        files: [
          {
            path: "video.mp4",
            kind: "video",
            mimeType: "video/mp4",
            sha256: "",
            size: 0,
            width: null,
            height: null,
          },
          {
            path: "poster.jpg",
            kind: "poster",
            mimeType: "image/jpeg",
            sha256: "",
            size: 0,
            width: 720,
            height: 1280,
          },
        ],
      }),
    );
    expect(result).toEqual({ w: null, h: null });
  });
});

describe("layoutAspectFor", () => {
  it("swaps the stored pixel aspect after a 90 or 270 degree rotation", () => {
    const rotated = save({
      id: "quarter",
      width: 400,
      height: 200,
      rotate: 90,
      files: [
        {
          path: "wide.jpg",
          kind: "media",
          mimeType: "image/jpeg",
          sha256: "",
          size: 0,
          width: 400,
          height: 200,
        },
      ],
    });
    expect(layoutAspectFor(rotated)).toBeCloseTo(0.5);
    expect(layoutAspectFor({ ...rotated, rotate: 270 })).toBeCloseTo(0.5);
    expect(layoutAspectFor({ ...rotated, rotate: 180 })).toBeCloseTo(2);
  });

  it("inverts a measured pixel ratio instead of the file dimensions", () => {
    recordAspect("measured-quarter", 400, 200);
    expect(
      layoutAspectFor(
        save({
          id: "measured-quarter",
          rotate: 90,
          width: 10,
          height: 10,
        }),
      ),
    ).toBeCloseTo(0.5);
  });
});

describe("clampRatio", () => {
  it("clamps extreme panoramas and portraits", () => {
    expect(clampRatio(4000, 100)).toBeCloseTo(2.5);
    expect(clampRatio(100, 4000)).toBeCloseTo(0.4);
  });
});
