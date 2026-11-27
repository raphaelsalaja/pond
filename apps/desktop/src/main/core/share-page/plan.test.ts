import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SaveFile } from "@pond/schema/db";
import { SharePageManifestSchema } from "@pond/schema/share-page";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_PAGE_OPTIONS,
  VIDEO_SIZE_LIMIT,
  assembleManifest,
  mediaJobs,
  planSharePage,
} from "./plan";
import type { SharePageSaveRow, StagedSize } from "./plan";

const NOW = new Date("2026-11-27T12:00:00.000Z");

function file(
  kind: string,
  path: string,
  extra: Partial<SaveFile> = {},
): SaveFile {
  return { kind, path, sha256: `sha-${path}`, size: 1000, ...extra };
}

function row(overrides: Partial<SharePageSaveRow> = {}): SharePageSaveRow {
  return {
    id: "01LIBRARYSAVEID",
    title: "Morning light",
    description: null,
    url: "https://example.com/p/1",
    source: "instagram",
    author: null,
    publishedAt: new Date("2026-11-01T08:30:00.000Z"),
    notes: "A private thought",
    tags: ["secret-tag"],
    files: [file("image", "original.jpg", { width: 4000, height: 3000 })],
    rawJson: {
      extractorId: "instagram",
      extractedAt: "2026-11-01T09:00:00.000Z",
      capture: {
        id: "post",
        source: "instagram",
        url: "https://example.com/p/1",
        description: "Shot on the ferry.",
        author: {
          name: "A. Photographer",
          handle: "@aphotographer",
          profileUrl: "https://example.com/aphotographer",
        },
        media: [],
      },
    },
    rotate: 0,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

/** Pretends every job was staged at the given size. */
function stageAll(
  plan: ReturnType<typeof planSharePage>,
  size: StagedSize = { width: 800, height: 600 },
): Map<string, StagedSize> {
  return new Map(mediaJobs(plan).map((job) => [job.to, size]));
}

function build(
  rows: Array<SharePageSaveRow>,
  options = DEFAULT_SHARE_PAGE_OPTIONS,
) {
  const plan = planSharePage({
    kind: "selection",
    title: "Saves",
    rows,
    options,
    now: NOW,
  });
  return assembleManifest(plan, stageAll(plan));
}

describe("planSharePage", () => {
  it("publishes the post, never the Library's private fields", () => {
    const manifest = build([row()]);
    expect(manifest.saves[0]).toEqual({
      id: "s1",
      title: "Morning light",
      text: "Shot on the ferry.",
      url: "https://example.com/p/1",
      source: "Instagram",
      author: {
        name: "A. Photographer",
        handle: "aphotographer",
        url: "https://example.com/aphotographer",
      },
      publishedAt: "2026-11-01T08:30:00.000Z",
      thumbnail: { src: "media/s1-thumb.webp", width: 800, height: 600 },
      media: [
        { kind: "image", src: "media/s1-0.webp", width: 800, height: 600 },
      ],
    });
    const json = JSON.stringify(manifest);
    for (const secret of [
      "A private thought",
      "secret-tag",
      "01LIBRARYSAVEID",
      "original.jpg",
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("includes notes and tags only when asked to", () => {
    const [save] = build([row()], { notes: true, tags: true }).saves;
    expect(save?.notes).toBe("A private thought");
    expect(save?.tags).toEqual(["secret-tag"]);
  });

  it("drops links that aren't on the web", () => {
    const base = row();
    const capture = base.rawJson?.capture;
    if (!capture) throw new Error("fixture");
    const [save] = build([
      row({
        url: "file:///Users/someone/Pictures/photo.jpg",
        rawJson: {
          extractorId: "web",
          extractedAt: "2026-11-01T09:00:00.000Z",
          capture: {
            ...capture,
            author: { name: "Someone", profileUrl: "javascript:alert(1)" },
          },
        },
      }),
    ]).saves;
    expect(save?.url).toBeUndefined();
    expect(save?.author).toEqual({ name: "Someone" });
  });

  it("pairs posters with videos by position", () => {
    const manifest = build([
      row({
        files: [
          file("video", "a.mp4"),
          file("poster", "a-poster.jpg"),
          file("video", "b.mp4"),
          file("poster", "b-poster.jpg"),
        ],
      }),
    ]);
    expect(manifest.saves[0]?.media).toEqual([
      {
        kind: "video",
        src: "media/s1-0.mp4",
        poster: { src: "media/s1-0-poster.webp", width: 800, height: 600 },
        width: 800,
        height: 600,
      },
      {
        kind: "video",
        src: "media/s1-2.mp4",
        poster: { src: "media/s1-2-poster.webp", width: 800, height: 600 },
        width: 800,
        height: 600,
      },
    ]);
  });

  it("shows a poster for a video a browser can't play or that's too big", () => {
    const manifest = build([
      row({
        files: [
          file("video", "a.mkv"),
          file("video", "b.mp4", { size: VIDEO_SIZE_LIMIT + 1 }),
          file("poster", "a-poster.jpg"),
          file("poster", "b-poster.jpg"),
        ],
      }),
    ]);
    expect(
      manifest.saves[0]?.media.map((media) => [media.kind, media.src]),
    ).toEqual([
      ["image", "media/s1-0-poster.webp"],
      ["image", "media/s1-1-poster.webp"],
    ]);
  });

  it("prefers the Save's Thumbnail for its card", () => {
    const plan = planSharePage({
      kind: "save",
      title: "Save",
      rows: [
        row({
          files: [
            file("image", "photo.jpg"),
            file("tweet_screenshot_light", "card.png"),
            file("thumbnail", "photo_thumbnail.png"),
          ],
        }),
      ],
      options: DEFAULT_SHARE_PAGE_OPTIONS,
      now: NOW,
    });
    expect(plan.saves[0]?.thumbnail?.file).toBe("photo_thumbnail.png");
  });

  it("leaves out media that couldn't be staged", () => {
    const plan = planSharePage({
      kind: "save",
      title: "Save",
      rows: [row({ files: [file("video", "a.mp4"), file("poster", "a.jpg")] })],
      options: DEFAULT_SHARE_PAGE_OPTIONS,
      now: NOW,
    });
    const staged = new Map([
      ["media/s1-0-poster.webp", { width: 10, height: 20 }],
    ]);
    expect(assembleManifest(plan, staged).saves[0]?.media).toEqual([
      { kind: "image", src: "media/s1-0-poster.webp", width: 10, height: 20 },
    ]);
  });

  it("stages a file once when two roles share it", () => {
    const plan = planSharePage({
      kind: "save",
      title: "Save",
      rows: [row({ files: [file("video", "a.mkv"), file("poster", "a.jpg")] })],
      options: DEFAULT_SHARE_PAGE_OPTIONS,
      now: NOW,
    });
    const targets = mediaJobs(plan).map((job) => job.to);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("share page manifest compatibility", () => {
  it("keeps reading the frozen version 1 example", () => {
    const example = resolve(
      import.meta.dirname,
      "../../../../test/fixtures/compatibility/share-page/example-manifest.json",
    );
    const parsed = SharePageManifestSchema.safeParse(
      JSON.parse(readFileSync(example, "utf8")),
    );
    expect(parsed.success).toBe(true);
  });
});
