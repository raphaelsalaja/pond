import type { SaveFile } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { mediaFilesByUrl } from "./card-media-files";

const IMAGE = "https://instagram.example/v/image.jpg?oe=1";
const POSTER = "https://instagram.example/v/poster.jpg?oe=1";

function file(kind: string, path: string): SaveFile {
  return { kind, path, sha256: "", size: 0 };
}

const capture: Capture = {
  id: "C1",
  source: "threads",
  url: "https://www.threads.com/@a/post/C1",
  media: [
    {
      type: "video",
      url: "https://instagram.example/v/clip.mp4",
      posterUrl: POSTER,
    },
    { type: "image", url: IMAGE },
  ],
};

describe("mediaFilesByUrl", () => {
  it("pairs each link with the file at its place in the post", () => {
    const poster = file("poster", "poster-1.jpg");
    const image = file("image", "media-2.jpg");

    const found = mediaFilesByUrl(capture, [
      file("avatar", "avatar.jpg"),
      poster,
      image,
      file("thumbnail", "media-2.jpg_thumbnail.webp"),
    ]);

    expect(found.get(POSTER)).toBe(poster);
    expect(found.get(IMAGE)).toBe(image);
  });

  it("finds nothing when no file sits at that place", () => {
    const found = mediaFilesByUrl(capture, [file("image", "media-1.jpg")]);

    expect(found.size).toBe(0);
  });
});
