import type { Save } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { CARD_INDEX_WIDTHS } from "../../../shared/media-index";
import { mediaWarmCandidates } from "./candidates";

function fixture(
  patch: Partial<Pick<Save, "id" | "title" | "status" | "files">>,
): Pick<Save, "id" | "title" | "status" | "files"> {
  return {
    id: "save-1",
    title: "Example",
    status: "complete",
    files: [],
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
  it("indexes the tiny placeholder before the final card thumbnail", () => {
    expect(CARD_INDEX_WIDTHS).toEqual([32, 768]);
  });

  it("repairs a video without a poster", () => {
    expect(
      mediaWarmCandidates(fixture({ files: [file("video", "video.mp4")] })),
    ).toEqual([{ kind: "poster", saveId: "save-1", title: "Example" }]);
  });

  it("warms a video's poster rather than the video bytes", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("video", "video.mp4"),
            file("poster", "poster.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "thumbnail",
        saveId: "save-1",
        sourceFile: "poster.jpg",
        version: "abcdef123456",
      }),
    ]);
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

  it("accepts a cover as the resting poster for a single video", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("video", "video.mp4"),
            file("cover", "cover.jpg", "image/jpeg"),
          ],
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "thumbnail",
        sourceFile: "cover.jpg",
      }),
    ]);
  });

  it("sweeps every card-displayable still image, including gallery slides", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          files: [
            file("image", "cover.png", "image/png"),
            file("image", "gallery.jpg", "image/jpeg"),
            file("avatar", "avatar.jpg", "image/jpeg"),
            file("source_icon", "icon.png", "image/png"),
          ],
        }),
      ),
    ).toEqual([
      expect.objectContaining({ kind: "thumbnail", sourceFile: "cover.png" }),
      expect.objectContaining({
        kind: "thumbnail",
        sourceFile: "gallery.jpg",
      }),
    ]);
  });

  it("includes HEIC covers that need native thumbnail conversion", () => {
    expect(
      mediaWarmCandidates(
        fixture({ files: [file("cover", "cover.heic", "image/heic")] }),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "thumbnail",
        sourceFile: "cover.heic",
      }),
    ]);
  });

  it("includes a legacy cover whose filename and metadata omit the format", () => {
    expect(
      mediaWarmCandidates(fixture({ files: [file("cover", "cover.")] })),
    ).toEqual([
      expect.objectContaining({
        kind: "thumbnail",
        sourceFile: "cover.",
      }),
    ]);
  });

  it("warms valid media retained by a failed legacy import", () => {
    expect(
      mediaWarmCandidates(
        fixture({
          status: "failed",
          files: [file("cover", "cover.jpg", "image/jpeg")],
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "thumbnail",
        sourceFile: "cover.jpg",
      }),
    ]);
  });

  it("skips vector, animated, and incomplete saves", () => {
    expect(
      mediaWarmCandidates(
        fixture({ files: [file("image", "image.gif", "image/gif")] }),
      ),
    ).toEqual([]);
    expect(
      mediaWarmCandidates(
        fixture({ status: "ingesting", files: [file("image", "image.png")] }),
      ),
    ).toEqual([]);
    expect(
      mediaWarmCandidates(
        fixture({ files: [file("cover", "cover.gif", "image/gif")] }),
      ),
    ).toEqual([]);
    expect(
      mediaWarmCandidates(
        fixture({ files: [file("image", "image.bmp", "image/bmp")] }),
      ),
    ).toEqual([]);
  });
});
