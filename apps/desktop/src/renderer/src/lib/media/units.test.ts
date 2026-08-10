import { describe, expect, it } from "vitest";
import type { Save, SaveFile } from "@/lib/types";
import { buildMediaUnits } from "./units";

function file(kind: string, path: string, mimeType: string): SaveFile {
  return { kind, path, mimeType, sha256: "abcdef1234567890", size: 10 };
}

describe("buildMediaUnits video posters", () => {
  it("uses a generic cover as the resting poster for every video", () => {
    const save = {
      id: "multi-video",
      source: "instagram",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("cover", "cover.jpg", "image/jpeg"),
        file("video", "video-2.mp4", "video/mp4"),
      ],
    } as Save;

    const units = buildMediaUnits(save);

    expect(units).toHaveLength(2);
    expect(units.map((unit) => unit.key)).toEqual([
      "video-1.mp4",
      "video-2.mp4",
    ]);
    expect(units.map((unit) => unit.posterUrl)).toEqual([
      "pond://multi-video/cover.jpg?v=abcdef123456",
      "pond://multi-video/cover.jpg?v=abcdef123456",
    ]);
    expect(units.map((unit) => unit.posterKey)).toEqual([
      "cover.jpg",
      "cover.jpg",
    ]);
  });

  it("uses the first poster for every video until the sweep fills missing slots", () => {
    const save = {
      id: "multi-video",
      source: "twitter",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("video", "video-2.mp4", "video/mp4"),
        file("poster", "poster.jpg", "image/jpeg"),
      ],
    } as Save;

    expect(buildMediaUnits(save).map((unit) => unit.posterUrl)).toEqual([
      "pond://multi-video/poster.jpg?v=abcdef123456",
      "pond://multi-video/poster.jpg?v=abcdef123456",
    ]);
  });

  it("keeps a cover as the visible unit for an image-only save", () => {
    const save = {
      id: "image-cover",
      source: "instagram",
      files: [
        file("cover", "cover.jpg", "image/jpeg"),
        file("avatar", "avatar.jpg", "image/jpeg"),
      ],
    } as Save;

    expect(buildMediaUnits(save)).toEqual([
      {
        key: "cover.jpg",
        url: "pond://image-cover/cover.jpg?v=abcdef123456",
        isVideo: false,
      },
    ]);
  });

  it("keeps a legacy extensionless cover as visible image media", () => {
    const save = {
      id: "legacy-cover",
      source: "cosmos",
      files: [file("cover", "cover.", "")],
    } as Save;

    expect(buildMediaUnits(save)).toEqual([
      {
        key: "cover.",
        url: "pond://legacy-cover/cover.?v=abcdef123456",
        isVideo: false,
      },
    ]);
  });
});
