import type { Save } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { mediaWarmCandidates } from "./candidates";

function fixture(
  patch: Partial<
    Pick<
      Save,
      "id" | "title" | "status" | "files" | "source" | "blurhash" | "coverIndex"
    >
  > = {},
): Pick<
  Save,
  "id" | "title" | "status" | "files" | "source" | "blurhash" | "coverIndex"
> {
  return {
    id: "save-1",
    title: "Example",
    status: "complete",
    source: "tiktok",
    files: [],
    blurhash: null,
    coverIndex: 0,
    ...patch,
  };
}

const file = (kind: string, path: string, mimeType?: string) => ({
  kind,
  path,
  mimeType,
  sha256: "abcdef1234567890",
  size: 10,
});

describe("mediaWarmCandidates", () => {
  it("repairs a video without a poster", () => {
    expect(
      mediaWarmCandidates(fixture({ files: [file("video", "video.mp4")] })),
    ).toEqual([{ kind: "poster", saveId: "save-1", title: "Example" }]);
  });

  it("encodes a blurhash from a video poster once the poster exists", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("video", "video.mp4"),
            file("poster", "poster.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([{ kind: "blurhash", saveId: "save-1", title: "Example" }]);
  });

  it("skips a save that already has a blurhash", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
          files: [file("cover", "cover.jpg", "image/jpeg")],
        }),
      ),
    ).toEqual([]);
  });

  it("fills the missing poster slots in a multi-video save", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("video", "video.mp4"),
            file("video", "video-1.mp4"),
            file("poster", "poster.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([{ kind: "poster", saveId: "save-1", title: "Example" }]);
  });

  it("repairs a stored poster whose aspect disagrees with its video", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          source: "youtube",
          files: [
            { ...file("video", "video.mp4"), width: 1080, height: 1920 },
            {
              ...file("poster", "poster-1.jpg", "image/jpeg"),
              width: 1280,
              height: 720,
            },
          ],
        }),
      ),
    ).toEqual([{ kind: "poster", saveId: "save-1", title: "Example" }]);
  });

  it("extracts a first-frame poster even when a cover already exists", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("video", "video.mp4"),
            file("cover", "cover.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([{ kind: "poster", saveId: "save-1", title: "Example" }]);
  });

  it("encodes one cover blurhash for a gallery", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("image", "cover.png", "image/png"),
            file("image", "gallery.jpg", "image/jpeg"),
            file("avatar", "avatar.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([{ kind: "blurhash", saveId: "save-1", title: "Example" }]);
  });

  it("skips vector, unsupported stills, and incomplete saves", () => {
    expect(
      mediaWarmCandidates(
        fixture({ files: [file("image", "image.svg", "image/svg+xml")] }),
      ),
    ).toEqual([]);
    expect(
      mediaWarmCandidates(
        fixture({ status: "ingesting", files: [file("image", "image.png")] }),
      ),
    ).toEqual([]);
  });
});
