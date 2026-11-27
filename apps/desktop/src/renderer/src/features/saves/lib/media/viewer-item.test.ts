import { describe, expect, it } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import { buildViewerItems } from "./viewer-item";

function file(
  path: string,
  kind: string,
  mimeType: string,
  sha256 = path,
): SaveFile {
  return { path, kind, mimeType, sha256, size: 1 };
}

function save(files: Array<SaveFile>, source: Save["source"] = "local"): Save {
  return {
    id: "viewer-items",
    source,
    sourceId: "viewer-items",
    url: "https://example.test/viewer-items",
    title: "Viewer items",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "file",
    files,
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("buildViewerItems", () => {
  it("keeps one stable item per non-auxiliary file in original order", () => {
    const items = buildViewerItems(
      save([
        file("first.jpg", "image", "image/jpeg", "111111111111aaaa"),
        file("first_thumbnail.png", "thumbnail", "image/png"),
        file("reference.pdf", "file", "application/pdf"),
        file("movie.mp4", "video", "video/mp4"),
        file("poster.jpg", "poster", "image/jpeg", "222222222222bbbb"),
      ]),
      { theme: "dark" },
    );

    expect(items.map(({ key, fileIndex }) => ({ key, fileIndex }))).toEqual([
      { key: "0:first.jpg", fileIndex: 0 },
      { key: "2:reference.pdf", fileIndex: 2 },
      { key: "3:movie.mp4", fileIndex: 3 },
    ]);
    expect(items.map((item) => item.capability.surface)).toEqual([
      "raster",
      "specialist",
      "temporal",
    ]);
    expect(items[0]?.url).toBe("pond://viewer-items/first.jpg?v=111111111111");
    expect(items[2]?.posterUrl).toBe(
      "pond://viewer-items/poster.jpg?v=222222222222",
    );
  });

  it("marks YouTube and Instagram platform posters as cross-file", () => {
    const items = buildViewerItems(
      save(
        [
          file("movie.mp4", "video", "video/mp4"),
          file("poster.jpg", "poster", "image/jpeg", "222222222222bbbb"),
        ],
        "youtube",
      ),
    );

    expect(items[0]).toMatchObject({
      posterUrl: "pond://viewer-items/poster.jpg?v=222222222222",
      posterIsCrossFile: true,
    });

    const instagram = buildViewerItems(
      save(
        [
          file("movie.mp4", "video", "video/mp4"),
          {
            ...file("poster.jpg", "poster", "image/jpeg", "222222222222bbbb"),
            sourceUrl: "https://cdn.test/cover.jpg",
          },
        ],
        "instagram",
      ),
    );
    expect(instagram[0]?.posterIsCrossFile).toBe(true);
  });

  it("keeps an Instagram first-frame poster without provenance same-file", () => {
    const items = buildViewerItems(
      save(
        [
          file("movie.mp4", "video", "video/mp4"),
          file("poster.jpg", "poster", "image/jpeg", "222222222222bbbb"),
        ],
        "instagram",
      ),
    );

    expect(items[0]?.posterIsCrossFile).toBeUndefined();
  });

  it("keeps a non-platform first-frame poster same-file", () => {
    const items = buildViewerItems(
      save(
        [
          file("movie.mp4", "video", "video/mp4"),
          file("poster.jpg", "poster", "image/jpeg", "222222222222bbbb"),
        ],
        "twitter",
      ),
    );

    expect(items[0]?.posterUrl).toBe(
      "pond://viewer-items/poster.jpg?v=222222222222",
    );
    expect(items[0]?.posterIsCrossFile).toBeUndefined();
  });

  it("does not discard unsupported originals", () => {
    const items = buildViewerItems(
      save([file("opaque.bin", "file", "application/octet-stream")]),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "0:opaque.bin",
      fileIndex: 0,
      capability: { surface: "fallback", originalActions: true },
    });
  });

  it("keeps rendered post cards out of the viewer", () => {
    const items = buildViewerItems(
      save([
        file("photo.jpg", "image", "image/jpeg"),
        file("tweet-light.png", "tweet_screenshot_light", "image/png"),
        file("tweet-dark.png", "tweet_screenshot_dark", "image/png"),
        file(
          "tweet-quote1-dark.png",
          "tweet_screenshot_quote1_dark",
          "image/png",
        ),
      ]),
    );

    expect(items.map(({ key }) => key)).toEqual(["0:photo.jpg"]);
  });

  it("shows the theme-matched card for a post with no media", () => {
    const items = buildViewerItems(
      save([
        file("tweet-light.png_thumbnail.png", "thumbnail", "image/png"),
        file("tweet-light.png", "tweet_screenshot_light", "image/png"),
        file("tweet-dark.png", "tweet_screenshot_dark", "image/png"),
      ]),
      { theme: "dark" },
    );

    expect(items.map(({ key }) => key)).toEqual(["2:tweet-dark.png"]);
  });

  it("opens a save with an article on the reader, then its media", () => {
    const items = buildViewerItems(
      save([
        file("cover.jpg", "image", "image/jpeg"),
        file("article.html", "article", "text/html"),
      ]),
    );

    expect(items.map(({ key }) => key)).toEqual([
      "1:article.html",
      "0:cover.jpg",
    ]);
    expect(items[0]?.capability).toMatchObject({
      kind: "article",
      surface: "specialist",
    });
  });

  it("uses one presentable derivative only when there are no originals", () => {
    const items = buildViewerItems(
      save([
        file("thumbnail.png", "thumbnail", "image/png", "light"),
        file("thumbnail-dark.png", "thumbnail_dark", "image/png", "dark"),
      ]),
      { theme: "dark" },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "1:thumbnail-dark.png",
      fileIndex: 1,
      capability: { surface: "raster" },
    });
  });
});
