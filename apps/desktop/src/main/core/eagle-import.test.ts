import { describe, expect, it } from "vitest";
import {
  collectLockedEagleFolders,
  flattenEagleFolders,
  isEagleBookmark,
  partitionEagleItemFiles,
} from "./eagle-import";

describe("flattenEagleFolders", () => {
  it("keeps nested parent ids and skips password folders", () => {
    const flat = flattenEagleFolders([
      {
        id: "root",
        name: "Photos",
        color: "#ff5500",
        children: [
          { id: "kids", name: "Kids" },
          { id: "secret", name: "Secret", password: "x" },
        ],
      },
    ]);
    expect(flat).toEqual([
      {
        id: "root",
        name: "Photos",
        parentId: null,
        color: "#ff5500",
        sortOrder: 0,
      },
      {
        id: "kids",
        name: "Kids",
        parentId: "root",
        color: null,
        sortOrder: 0,
      },
    ]);
  });

  it("reports locked folders instead of silently dropping them", () => {
    const folders = [
      {
        id: "root",
        name: "Photos",
        children: [{ id: "secret", name: "Secret", password: "x" }],
      },
    ];
    expect(collectLockedEagleFolders(folders)).toEqual([
      { id: "secret", name: "Secret", reason: "password" },
    ]);
  });

  it("reports nested folders under a locked parent and keeps them out of flatten", () => {
    const folders = [
      {
        id: "vault",
        name: "Vault",
        password: "x",
        children: [{ id: "inner", name: "Inner" }],
      },
    ];
    expect(collectLockedEagleFolders(folders)).toEqual([
      { id: "vault", name: "Vault", reason: "password" },
      { id: "inner", name: "Inner", reason: "parent_locked" },
    ]);
    expect(flattenEagleFolders(folders)).toEqual([]);
  });

  it("preserves Eagle's sibling order", () => {
    expect(
      flattenEagleFolders([
        { id: "first", name: "First" },
        { id: "second", name: "Second" },
      ]),
    ).toEqual([
      {
        id: "first",
        name: "First",
        parentId: null,
        color: null,
        sortOrder: 0,
      },
      {
        id: "second",
        name: "Second",
        parentId: null,
        color: null,
        sortOrder: 1,
      },
    ]);
  });
});

describe("partitionEagleItemFiles", () => {
  it("keeps arbitrary originals and separates Eagle's generated thumbnail", () => {
    expect(
      partitionEagleItemFiles([
        "metadata.json",
        "paper.pdf",
        "attachment.usdz",
        "paper_thumbnail.png",
        ".DS_Store",
      ]),
    ).toEqual({
      mediaFiles: ["paper.pdf", "attachment.usdz"],
      thumbnail: "paper_thumbnail.png",
    });
  });

  it("does not mistake an original with thumbnail in its name for Eagle's preview", () => {
    expect(
      partitionEagleItemFiles([
        "metadata.json",
        "thumbnail-concept.psd",
        "thumbnail-concept.psd_thumbnail.png",
      ]),
    ).toEqual({
      mediaFiles: ["thumbnail-concept.psd"],
      thumbnail: "thumbnail-concept.psd_thumbnail.png",
    });
  });

  it("drops a bookmark's Internet Shortcut and keeps its page screenshot", () => {
    const files = ["metadata.json", "Studio.url", "Studio_thumbnail.png"];
    expect(partitionEagleItemFiles(files, true)).toEqual({
      mediaFiles: [],
      thumbnail: "Studio_thumbnail.png",
    });
    expect(partitionEagleItemFiles(files).mediaFiles).toEqual(["Studio.url"]);
  });

  it("recognizes the WebP sidecar Eagle also writes beside items", () => {
    expect(
      partitionEagleItemFiles([
        "metadata.json",
        "ICON PICKER.png",
        "ICON PICKER_thumbnail.webp",
      ]),
    ).toEqual({
      mediaFiles: ["ICON PICKER.png"],
      thumbnail: "ICON PICKER_thumbnail.webp",
    });
  });

  it("prefers the PNG sidecar and keeps both suffixes out of media", () => {
    expect(
      partitionEagleItemFiles([
        "Poster.jpg",
        "Poster_thumbnail.webp",
        "Poster_thumbnail.png",
      ]),
    ).toEqual({
      mediaFiles: ["Poster.jpg"],
      thumbnail: "Poster_thumbnail.png",
    });
  });

  it("leaves a standalone thumbnail item with no media so the import skips it", () => {
    expect(
      partitionEagleItemFiles(["metadata.json", "ICON PICKER_thumbnail.webp"]),
    ).toEqual({
      mediaFiles: [],
      thumbnail: "ICON PICKER_thumbnail.webp",
    });
  });
});

describe("isEagleBookmark", () => {
  it("needs both the url extension and a link", () => {
    expect(isEagleBookmark({ ext: "url", url: "https://example.com/" })).toBe(
      true,
    );
    expect(isEagleBookmark({ ext: "URL", url: "https://example.com/" })).toBe(
      true,
    );
    expect(isEagleBookmark({ ext: "url", url: " " })).toBe(false);
    expect(isEagleBookmark({ ext: "png", url: "https://example.com/" })).toBe(
      false,
    );
  });
});
