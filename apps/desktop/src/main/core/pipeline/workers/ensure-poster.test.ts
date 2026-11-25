import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { persistSave } from "../../persist-save";
import type { ensureSaveThumbnail } from "../../save-thumbnail";
import { ensureRemotePoster } from "./ensure-poster";
import type { RemotePosterSave } from "./ensure-poster";

const POSTER_URL = "https://cdn.test/poster.jpg";

const videoCapture = storedAsRawJson({
  capture: {
    media: [
      { type: "video", url: "https://cdn.test/v.mp4", posterUrl: POSTER_URL },
    ],
  },
});

const existingPoster: SaveFile = {
  kind: "poster",
  path: "poster-1.jpg",
  sha256: "",
  size: 1,
  mimeType: "image/jpeg",
};

function image(bytes: Buffer) {
  return {
    file: { filename: "poster.jpg", bytes, mimeType: "image/jpeg" },
  };
}

function jpeg(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: "#000" },
  })
    .jpeg()
    .toBuffer();
}

type PersistArgs = Parameters<typeof persistSave>;
type ThumbnailArgs = Parameters<typeof ensureSaveThumbnail>;

type PosterFetch = (
  url: string,
) => Promise<ReturnType<typeof image> | { miss: "permanent" }>;

function recordingRuntime(fetchPoster: PosterFetch) {
  const fetched: Array<string> = [];
  const persisted: Array<[string, unknown, unknown]> = [];
  const thumbnails: Array<[string, unknown, unknown]> = [];
  return {
    fetched,
    persisted,
    thumbnails,
    runtime: {
      fetchAvatarToTxFile: async (url: string) => {
        fetched.push(url);
        return fetchPoster(url);
      },
      persistSave: async (...[id, patch, options]: PersistArgs) => {
        persisted.push([id, patch, options]);
        return null;
      },
      ensureSaveThumbnail: async (
        ...[saveId, save, options]: ThumbnailArgs
      ) => {
        thumbnails.push([saveId, save, options]);
      },
    },
  };
}

async function setup() {
  const bytes = await jpeg(4, 3);
  return recordingRuntime(async () => image(bytes));
}

function save(overrides: Partial<RemotePosterSave> = {}): RemotePosterSave {
  return { files: [], rawJson: videoCapture, mediaUrl: null, ...overrides };
}

describe("ensureRemotePoster", () => {
  it("writes the captured poster when the save has no video file", async () => {
    const { runtime, fetched, persisted, thumbnails } = await setup();

    await ensureRemotePoster("s1", save(), false, runtime);

    expect(fetched).toEqual([POSTER_URL]);
    expect(persisted).toEqual([
      [
        "s1",
        {},
        expect.objectContaining({
          replaceFilesWithKind: "poster",
          newFiles: [
            expect.objectContaining({
              kind: "poster",
              filename: "poster-1.jpg",
              mimeType: "image/jpeg",
              width: 4,
              height: 3,
            }),
          ],
        }),
      ],
    ]);
    expect(thumbnails).toEqual([["s1", null, { force: true }]]);
  });

  it("does nothing when no poster URL is known", async () => {
    const { runtime, fetched, persisted } = await setup();

    await ensureRemotePoster(
      "s1",
      save({
        rawJson: storedAsRawJson({
          capture: {
            media: [{ type: "video", url: "https://cdn.test/v.mp4" }],
          },
        }),
      }),
      false,
      runtime,
    );

    expect(fetched).toEqual([]);
    expect(persisted).toEqual([]);
  });

  it("uses a portrait Shorts file and skips a landscape original-aspect file", async () => {
    const landscape = await jpeg(4, 2);
    const portrait = await jpeg(2, 4);
    const id = "a88WoGBL1Mc";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const oar2 = `https://i.ytimg.com/vi/${id}/oar2.jpg`;
    const oardefault = `https://i.ytimg.com/vi/${id}/oardefault.jpg`;
    const { runtime, fetched, persisted } = recordingRuntime(async (url) => {
      if (url === oar2) {
        return image(landscape);
      }
      if (url === oardefault) {
        return image(portrait);
      }
      return { miss: "permanent" };
    });

    await ensureRemotePoster(
      "s1",
      save({
        rawJson: storedAsRawJson({
          capture: {
            id,
            source: "youtube",
            url: `https://www.youtube.com/watch?v=${id}`,
            duration: 39,
            media: [
              {
                type: "video",
                url: `https://www.youtube.com/watch?v=${id}`,
                posterUrl: hq,
              },
            ],
          },
        }),
      }),
      false,
      runtime,
    );

    expect(fetched).toEqual([oar2, oardefault]);
    expect(persisted).toEqual([
      [
        "s1",
        {},
        expect.objectContaining({
          newFiles: [expect.objectContaining({ width: 2, height: 4 })],
        }),
      ],
    ]);
  });

  it("keeps the current thumbnail when every Shorts candidate is landscape", async () => {
    const landscape = await jpeg(4, 2);
    const id = "dQw4w9WgXcQ";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const { runtime, persisted } = recordingRuntime(async (url) =>
      url === `https://i.ytimg.com/vi/${id}/oardefault.jpg`
        ? { miss: "permanent" }
        : image(landscape),
    );

    await ensureRemotePoster(
      "s1",
      save({
        rawJson: storedAsRawJson({
          capture: {
            id,
            source: "youtube",
            url: `https://www.youtube.com/watch?v=${id}`,
            duration: 30,
            media: [
              {
                type: "video",
                url: `https://www.youtube.com/watch?v=${id}`,
                posterUrl: hq,
              },
            ],
          },
        }),
      }),
      false,
      runtime,
    );

    expect(persisted).toEqual([
      [
        "s1",
        {},
        expect.objectContaining({
          newFiles: [expect.objectContaining({ width: 4, height: 2 })],
        }),
      ],
    ]);
  });

  it("does not probe upright files for a longer YouTube video", async () => {
    const id = "dQw4w9WgXcQ";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const { runtime, fetched } = await setup();

    await ensureRemotePoster(
      "s1",
      save({
        rawJson: storedAsRawJson({
          capture: {
            id,
            source: "youtube",
            url: `https://www.youtube.com/watch?v=${id}`,
            duration: 213,
            media: [
              {
                type: "video",
                url: `https://www.youtube.com/watch?v=${id}`,
                posterUrl: hq,
              },
            ],
          },
        }),
      }),
      false,
      runtime,
    );

    expect(fetched).toEqual([hq]);
  });

  it("keeps an existing poster unless forced", async () => {
    const { runtime, fetched, persisted } = await setup();

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      false,
      runtime,
    );
    expect(fetched).toEqual([]);

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      true,
      runtime,
    );
    expect(persisted).toHaveLength(1);
  });
});
