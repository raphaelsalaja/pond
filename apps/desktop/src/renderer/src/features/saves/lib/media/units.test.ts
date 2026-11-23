import { describe, expect, it } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import {
  buildMediaUnits,
  buildOriginalMediaUnits,
  deriveTypeKind,
  deriveTypeLabel,
  pickCardUnit,
  pickPrimaryUnit,
} from "./units";

function file(kind: string, path: string, mimeType: string): SaveFile {
  return { kind, path, mimeType, sha256: "abcdef1234567890", size: 10 };
}

function makeSave(partial: Partial<Save> & { id: string }): Save {
  return {
    source: "web",
    sourceId: partial.id,
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...partial,
  };
}

describe("buildMediaUnits video posters", () => {
  it("uses the first poster for every video until the sweep fills missing slots", () => {
    const save = makeSave({
      id: "multi-video",
      source: "twitter",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("video", "video-2.mp4", "video/mp4"),
        file("poster", "poster.jpg", "image/jpeg"),
      ],
    });

    expect(buildMediaUnits(save).map((unit) => unit.posterUrl)).toEqual([
      "pond://multi-video/poster.jpg?v=abcdef123456",
      "pond://multi-video/poster.jpg?v=abcdef123456",
    ]);
  });

  it("treats a harvested post's lone image as its video's cover", () => {
    const save = makeSave({
      id: "reel",
      source: "instagram",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("image", "media-1.jpg", "image/jpeg"),
      ],
    });

    expect(buildMediaUnits(save)).toEqual([
      {
        key: "video-1.mp4",
        url: "pond://reel/video-1.mp4?v=abcdef123456",
        isVideo: true,
        posterUrl: "pond://reel/media-1.jpg?v=abcdef123456",
        posterKey: "media-1.jpg",
      },
    ]);
  });

  it("shows every file of a local gallery with one video and one image", () => {
    const save = makeSave({
      id: "gallery",
      source: "local",
      files: [
        file("video", "clip.mp4", "video/mp4"),
        file("image", "photo.jpg", "image/jpeg"),
        file("poster", "poster-1.jpg", "image/jpeg"),
      ],
    });

    expect(buildMediaUnits(save).map((unit) => unit.key)).toEqual([
      "clip.mp4",
      "photo.jpg",
    ]);
    expect(buildMediaUnits(save)[0]?.posterKey).toBe("poster-1.jpg");
  });

  it("keeps a cover as the visible unit for an image-only save", () => {
    const save = makeSave({
      id: "image-cover",
      source: "instagram",
      files: [
        file("image", "cover.jpg", "image/jpeg"),
        file("avatar", "avatar.jpg", "image/jpeg"),
      ],
    });

    expect(buildMediaUnits(save)).toEqual([
      {
        key: "cover.jpg",
        url: "pond://image-cover/cover.jpg?v=abcdef123456",
        isVideo: false,
      },
    ]);
  });

  it("keeps an extensionless cover image as visible media", () => {
    const save = makeSave({
      id: "bare-cover",
      source: "cosmos",
      files: [file("image", "cover.", "")],
    });

    expect(buildMediaUnits(save)).toEqual([
      {
        key: "cover.",
        url: "pond://bare-cover/cover.?v=abcdef123456",
        isVideo: false,
      },
    ]);
  });
});

describe("pickPrimaryUnit Threads post cover", () => {
  const threadsSave = makeSave({
    id: "thread-1",
    source: "threads",
    files: [
      file("image", "photo.jpg", "image/jpeg"),
      file("tweet_screenshot_light", "tweet-light.png", "image/png"),
      file("tweet_screenshot_dark", "tweet-dark.png", "image/png"),
    ],
  });

  it("uses extracted media when tweetCover is media", () => {
    const unit = pickPrimaryUnit(threadsSave, {
      theme: "light",
      tweetCover: "media",
    });
    expect(unit?.key).toBe("photo.jpg");
  });

  it("uses the theme-matched card PNG when tweetCover is screenshot", () => {
    const unit = pickPrimaryUnit(threadsSave, {
      theme: "dark",
      tweetCover: "screenshot",
    });
    expect(unit?.key).toBe("tweet-dark.png");
  });

  it("shows only media for a post with media, and the card PNG otherwise", () => {
    const quoted = makeSave({
      id: "tweet-quote",
      source: "twitter",
      files: [
        file("image", "photo.jpg", "image/jpeg"),
        file("tweet_screenshot_dark", "tweet-dark.png", "image/png"),
        file("tweet_screenshot_quote1_dark", "quote-dark.png", "image/png"),
      ],
    });
    expect(
      buildMediaUnits(quoted, { theme: "dark" }).map((u) => u.key),
    ).toEqual(["photo.jpg"]);

    const textOnly = makeSave({
      id: "tweet-text",
      source: "twitter",
      files: [
        file("tweet_screenshot_light", "tweet-light.png", "image/png"),
        file("tweet_screenshot_quote1_light", "quote-light.png", "image/png"),
      ],
    });
    expect(
      buildMediaUnits(textOnly, { theme: "light" }).map((u) => u.key),
    ).toEqual(["tweet-light.png"]);
    expect(buildOriginalMediaUnits(textOnly)).toEqual([]);
    expect(buildOriginalMediaUnits(quoted).map((u) => u.key)).toEqual([
      "photo.jpg",
    ]);
  });

  it("falls back to the card PNG for a text-only Threads post", () => {
    const textOnly = makeSave({
      id: "thread-text",
      source: "threads",
      files: [
        file("tweet_screenshot_light", "tweet-light.png", "image/png"),
        file("avatar", "avatar.jpg", "image/jpeg"),
      ],
    });
    const unit = pickPrimaryUnit(textOnly, {
      theme: "light",
      tweetCover: "media",
    });
    expect(unit?.key).toBe("tweet-light.png");
  });
});

describe("deriveTypeLabel web pages", () => {
  it("labels a web save as Web even when the cover is a PNG", () => {
    const save = makeSave({
      id: "page-1",
      source: "web",
      mediaType: "image",
      files: [file("cover", "cover.png", "image/png")],
    });
    const cover = save.files[0] ?? null;
    expect(deriveTypeLabel(cover, save)).toBe("Web");
    expect(deriveTypeKind(cover, save)).toBe("link");
  });

  it("labels a save with a stored article as Article, not its cover format", () => {
    const save = makeSave({
      id: "post-1",
      source: "substack",
      mediaType: "image",
      files: [
        file("image", "cover.jpeg", "image/jpeg"),
        file("article", "article.html", "text/html"),
      ],
    });
    expect(deriveTypeLabel(save.files[0] ?? null, save)).toBe("Article");
  });

  it("labels a GitHub save as a Repository, even with a README article", () => {
    const save = makeSave({
      id: "repo-1",
      source: "github",
      mediaType: "text",
      files: [file("article", "article.html", "text/html")],
    });
    expect(deriveTypeLabel(save.files[0] ?? null, save)).toBe("Repository");
  });

  it("still uses the file extension for non-web image saves", () => {
    const save = makeSave({
      id: "photo-1",
      source: "instagram",
      mediaType: "image",
      files: [file("image", "photo.png", "image/png")],
    });
    const image = save.files[0] ?? null;
    expect(deriveTypeLabel(image, save)).toBe("PNG");
    expect(deriveTypeKind(image, save)).toBe("image");
  });
});

describe("expanded library formats", () => {
  it("keeps proprietary Eagle images out of the media carousel", () => {
    const save = makeSave({
      id: "psd-1",
      source: "local",
      mediaType: "image",
      files: [file("file", "layout.psd", "image/vnd.adobe.photoshop")],
    });
    expect(buildMediaUnits(save)).toEqual([]);
    expect(pickCardUnit(save)).toMatchObject({
      key: "layout.psd",
      requiresGeneratedPreview: true,
    });
  });

  it("uses a native thumbnail fallback for non-browser Eagle video formats", () => {
    const save = makeSave({
      id: "mpeg-1",
      source: "local",
      mediaType: "video",
      files: [file("video", "movie.mpeg", "video/mpeg")],
    });
    expect(buildMediaUnits(save)).toEqual([]);
    expect(pickCardUnit(save)).toMatchObject({
      key: "movie.mpeg",
      requiresGeneratedPreview: true,
    });
  });

  it("marks native image formats for generated previews", () => {
    const save = makeSave({
      id: "heic-1",
      source: "local",
      mediaType: "image",
      files: [file("cover", "holiday.heic", "image/heic")],
    });
    expect(buildMediaUnits(save)[0]).toMatchObject({
      key: "holiday.heic",
      requiresGeneratedPreview: true,
    });
  });

  it("uses a dedicated thumbnail for card selection", () => {
    const save = makeSave({
      id: "pdf-1",
      source: "local",
      mediaType: "document",
      files: [
        file("document", "paper.pdf", "application/pdf"),
        file("thumbnail", "paper.pdf_thumbnail.png", "image/png"),
      ],
    });
    expect(pickCardUnit(save)?.key).toBe("paper.pdf_thumbnail.png");
    expect(buildMediaUnits(save)).toEqual([]);
  });

  it("does not use a caption text card when the save has a video poster", () => {
    const save = makeSave({
      id: "ig-reel",
      source: "instagram",
      mediaType: "video",
      files: [
        file("thumbnail", "thumbnail.png", "image/png"),
        file("thumbnail_dark", "thumbnail-dark.png", "image/png"),
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
      ],
    });
    expect(pickCardUnit(save)).toMatchObject({
      key: "video-1.mp4",
      isVideo: true,
      posterKey: "poster-1.jpg",
    });
  });

  it("requests a native card preview for PDFs without changing content media", () => {
    const save = makeSave({
      id: "pdf-2",
      source: "local",
      mediaType: "document",
      files: [file("document", "paper.pdf", "application/pdf")],
    });
    expect(pickCardUnit(save)).toMatchObject({
      key: "paper.pdf",
      requiresGeneratedPreview: true,
    });
    expect(pickPrimaryUnit(save)).toBeNull();
  });

  it("requests a native card preview for audio without changing content media", () => {
    const save = makeSave({
      id: "audio-1",
      source: "local",
      mediaType: "audio",
      files: [file("audio", "recording.m4a", "audio/mp4")],
    });
    expect(pickCardUnit(save)).toMatchObject({
      key: "recording.m4a",
      requiresGeneratedPreview: true,
    });
    expect(pickPrimaryUnit(save)).toBeNull();
  });

  it.each([
    ["song.m4a", "audio/mp4", "audio", "M4A"],
    ["paper.pdf", "application/pdf", "doc", "PDF"],
    ["family.woff2", "font/woff2", "font", "WOFF2"],
  ] as const)("derives %s metadata", (path, mimeType, kind, label) => {
    const save = makeSave({
      id: path,
      source: "local",
      files: [file("file", path, mimeType)],
    });
    expect(deriveTypeKind(save.files[0] ?? null, save)).toBe(kind);
    expect(deriveTypeLabel(save.files[0] ?? null, save)).toBe(label);
  });
});

describe("pickCardUnit poster-only video", () => {
  it("shows the poster when the video file is not downloaded", () => {
    const save = makeSave({
      id: "poster-only",
      source: "youtube",
      mediaType: "video",
      files: [file("poster", "poster.jpg", "image/jpeg")],
    });
    const unit = pickCardUnit(save);
    expect(unit?.key).toBe("poster.jpg");
    expect(unit?.isVideo).toBe(false);
  });

  it("keeps a media thumbnail ahead of the poster", () => {
    const save = makeSave({
      id: "poster-thumb",
      source: "youtube",
      mediaType: "video",
      files: [
        file("poster", "poster.jpg", "image/jpeg"),
        file("thumbnail", "poster.jpg_thumbnail.webp", "image/webp"),
      ],
    });
    expect(pickCardUnit(save, { theme: "light" })?.key).toBe(
      "poster.jpg_thumbnail.webp",
    );
  });
});
