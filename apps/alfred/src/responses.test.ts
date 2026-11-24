import { describe, expect, it } from "vitest";
import { SavesResponseSchema } from "./responses";

const apiSave = {
  id: "01J",
  libraryId: "c0ffee",
  source: "twitter",
  url: "https://x.com/a",
  title: "Poster",
  description: null,
  author: "someone",
  siteName: "X",
  tags: ["posters"],
  folderIds: [],
  note: null,
  rating: 4,
  kind: "image",
  status: "complete",
  savedAt: 1_761_091_200_000,
  publishedAt: null,
  deletedAt: null,
  media: { files: 1, width: 1200, height: 1600, duration: null, bytes: 1 },
  thumbnail: true,
  text: { caption: false, ocr: true, transcript: false },
};

describe("SavesResponseSchema", () => {
  it("keeps the fields the workflow shows from a full API Save", () => {
    const parsed = SavesResponseSchema.parse({
      status: "success",
      data: { libraryId: "c0ffee", saves: [apiSave] },
    });
    expect(parsed.data.saves).toEqual([
      {
        id: "01J",
        url: "https://x.com/a",
        title: "Poster",
        siteName: "X",
        source: "twitter",
        tags: ["posters"],
      },
    ]);
  });

  it("rejects a body without saves", () => {
    expect(
      SavesResponseSchema.safeParse({ status: "success", data: {} }).success,
    ).toBe(false);
  });
});
