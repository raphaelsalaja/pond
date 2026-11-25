// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import {
  cancelPreload,
  heldImageUrls,
  preloadImage,
  saveImageUrls,
} from "./preload";

function file(path: string, mimeType: string, kind = "media"): SaveFile {
  return {
    path,
    kind,
    mimeType,
    width: 1200,
    height: 800,
    size: 1,
    sha256: "",
  };
}

function saveWith(files: Array<SaveFile>): Save {
  return {
    id: "s",
    source: "web",
    sourceId: "s",
    url: "https://example.test",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files,
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

describe("saveImageUrls", () => {
  it("prepares an image once when the viewer and Details show the same file", () => {
    expect(
      saveImageUrls(saveWith([file("a.jpg", "image/jpeg")]), "light", {
        details: true,
      }),
    ).toEqual(["pond://s/a.jpg"]);
  });

  it("prepares a video's poster and its Details thumbnail, not the stream", () => {
    const video = saveWith([
      file("clip.mp4", "video/mp4", "video"),
      file("poster.jpg", "image/jpeg", "poster"),
      file("thumb.jpg", "image/jpeg", "thumbnail"),
    ]);

    expect(saveImageUrls(video, "light", { details: true })).toEqual([
      "pond://s/poster.jpg",
      "pond://s/thumb.jpg",
    ]);
  });

  it("skips the Details preview while Details is closed", () => {
    const video = saveWith([
      file("clip.mp4", "video/mp4", "video"),
      file("poster.jpg", "image/jpeg", "poster"),
      file("thumb.jpg", "image/jpeg", "thumbnail"),
    ]);

    expect(saveImageUrls(video, "light", { details: false })).toEqual([
      "pond://s/poster.jpg",
    ]);
  });
});

describe("preloadImage", () => {
  const rejects = new Map<string, () => void>();
  const fail = (src: string) => rejects.get(src)?.();

  /** jsdom never decodes, so pending decodes model originals still loading. */
  beforeEach(() => {
    rejects.clear();
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value(this: HTMLImageElement) {
        return new Promise<void>((_, reject) => {
          rejects.set(this.src, () => reject(new Error("decode failed")));
        });
      },
    });
  });

  afterEach(() => {
    for (const url of heldImageUrls()) cancelPreload(url);
    Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  });

  it("holds the most recent originals and drops the oldest", () => {
    for (const name of ["1", "2", "3", "4"]) preloadImage(`pond://p/${name}`);
    preloadImage("pond://p/2");
    preloadImage("pond://p/5");

    expect(heldImageUrls()).toEqual(["pond://p/4", "pond://p/2", "pond://p/5"]);
  });

  it("stops a preload that has not finished", () => {
    preloadImage("pond://p/left");
    cancelPreload("pond://p/left");

    expect(heldImageUrls()).not.toContain("pond://p/left");
  });

  it("forgets an image that fails to decode so the next visit tries again", async () => {
    preloadImage("pond://p/broken");
    fail("pond://p/broken");
    await Promise.resolve();
    await Promise.resolve();

    expect(heldImageUrls()).not.toContain("pond://p/broken");
    preloadImage("pond://p/broken");
    expect(heldImageUrls()).toContain("pond://p/broken");
  });
});
