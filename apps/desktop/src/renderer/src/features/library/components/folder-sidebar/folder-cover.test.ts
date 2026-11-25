import { describe, expect, it } from "vitest";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import type { Save } from "@/features/saves/types";

function coverSave(): Save {
  return {
    id: "cover-save",
    source: "local",
    sourceId: "cover-save",
    url: "pond:local/cover-save",
    title: "Cover",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [
      {
        kind: "cover",
        path: "photo.png",
        mimeType: "image/png",
        sha256: "abcdef1234567890",
        size: 1,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("folder cover url", () => {
  it("points at the cover file", () => {
    expect(folderCoverUrl(coverSave())).toMatch(
      /^pond:\/\/cover-save\/photo\.png/,
    );
  });

  it("requests a generated preview for a file the browser cannot draw", () => {
    const save = coverSave();
    save.id = "style-save";
    save.mediaType = "file";
    save.files = [
      {
        kind: "file",
        path: "metadata.plist",
        mimeType: "application/octet-stream",
        sha256: "abcdef1234567890",
        size: 391,
      },
    ];
    const url = folderCoverUrl(save, 360);
    expect(url).toMatch(/^pond:\/\/style-save\/metadata\.plist/);
    expect(url).toContain("preview=");
    expect(url).not.toContain("tw=");
  });

  it("uses the text thumbnail a code file keeps beside its source", () => {
    document.documentElement.dataset.theme = "light";
    const save = coverSave();
    save.id = "code-save";
    save.mediaType = "text";
    save.files = [
      {
        kind: "text_file",
        path: "sample.ts",
        mimeType: "text/typescript",
        sha256: "abcdef1234567890",
        size: 69,
      },
      {
        kind: "thumbnail",
        path: "thumbnail.png",
        mimeType: "image/png",
        sha256: "abcdef1234567890",
        size: 22_951,
      },
      {
        kind: "thumbnail_dark",
        path: "thumbnail-dark.png",
        mimeType: "image/png",
        sha256: "abcdef1234567890",
        size: 20_623,
      },
    ];
    expect(folderCoverUrl(save, 360)).toMatch(
      /^pond:\/\/code-save\/thumbnail\.png/,
    );
    document.documentElement.dataset.theme = "dark";
    expect(folderCoverUrl(save, 360)).toMatch(
      /^pond:\/\/code-save\/thumbnail-dark\.png/,
    );
    delete document.documentElement.dataset.theme;
  });

  it("prefers a new light WebP thumbnail over a retained dark thumbnail", () => {
    const save = coverSave();
    save.id = "custom-cover";
    save.mediaType = "text";
    save.files = [
      {
        kind: "thumbnail_dark",
        path: "thumbnail-dark.png",
        mimeType: "image/png",
        sha256: "dark",
        size: 1,
      },
      {
        kind: "thumbnail",
        path: "thumbnail.webp",
        mimeType: "image/webp",
        sha256: "light",
        size: 1,
      },
    ];

    expect(folderCoverUrl(save, 360, "light")).toMatch(
      /^pond:\/\/custom-cover\/thumbnail\.webp/,
    );
    expect(folderCoverUrl(save, 360, "dark")).toMatch(
      /^pond:\/\/custom-cover\/thumbnail-dark\.png/,
    );
  });
});
