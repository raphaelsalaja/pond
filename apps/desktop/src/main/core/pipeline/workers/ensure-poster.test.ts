import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PosterWrite } from "../../../lib/poster-policy";
import { recordedShort } from "../../../lib/youtube-short-covers.fixture";
import type { RecordedPlayer } from "../../../lib/youtube-short-covers.fixture";
import type { persistSave } from "../../persist-save";
import type { ensureSaveThumbnail } from "../../save-thumbnail";
import { chooseVideoPoster, ensureRemotePoster } from "./ensure-poster";
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
              sourceUrl: POSTER_URL,
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

  it("uses a Short's display cover without reaching the automatic frame", async () => {
    const landscape = await jpeg(4, 2);
    const portrait = await jpeg(2, 4);
    const id = "a88WoGBL1Mc";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const oar2 = `https://i.ytimg.com/vi/${id}/oar2.jpg`;
    const oardefault = `https://i.ytimg.com/vi/${id}/oardefault.jpg`;
    const { runtime, fetched, persisted } = recordingRuntime(async (url) => {
      if (url === hq) {
        return image(landscape);
      }
      if (url === oar2 || url === oardefault) {
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

    expect(fetched).toEqual([hq, oardefault]);
    expect(persisted).toEqual([
      [
        "s1",
        {},
        expect.objectContaining({
          newFiles: [
            expect.objectContaining({
              width: 2,
              height: 4,
              sourceUrl: oardefault,
            }),
          ],
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

function posterWrite(
  width: number,
  height: number,
  sourceUrl?: string,
): PosterWrite {
  const poster: PosterWrite = {
    kind: "poster",
    filename: "poster-1.jpg",
    bytes: Buffer.from([1]),
    mimeType: "image/jpeg",
    width,
    height,
  };
  if (sourceUrl) poster.sourceUrl = sourceUrl;
  return poster;
}

function posterCandidates(found: {
  platform?: PosterWrite;
  frame?: PosterWrite;
}) {
  const calls: Array<"platform" | "frame"> = [];
  return {
    calls,
    candidates: {
      platformPoster: async () => {
        calls.push("platform");
        return found.platform ?? null;
      },
      framePoster: async () => {
        calls.push("frame");
        return found.frame ?? null;
      },
    },
  };
}

const portraitVideo = { width: 1080, height: 1920 };
const COVER_URL = "https://i.ytimg.com/vi/x/hqdefault.jpg";

describe("chooseVideoPoster", () => {
  it("writes a platform cover that matches the video without extracting a frame", async () => {
    const cover = posterWrite(1080, 1920, COVER_URL);
    const { calls, candidates } = posterCandidates({ platform: cover });

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: true, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "write", poster: cover });
    expect(calls).toEqual(["platform"]);
  });

  it("replaces a landscape platform cover on a portrait video with the first frame", async () => {
    const frame = posterWrite(1080, 1920);
    const { calls, candidates } = posterCandidates({
      platform: posterWrite(1280, 720, COVER_URL),
      frame,
    });

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: true, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "write", poster: frame });
    expect(calls).toEqual(["platform", "frame"]);
  });

  it("uses only the first frame for sources without platform covers", async () => {
    const frame = posterWrite(1080, 1920);
    const { calls, candidates } = posterCandidates({
      platform: posterWrite(1080, 1920, COVER_URL),
      frame,
    });

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: false, usePlatform: false },
        candidates,
      ),
    ).resolves.toEqual({ kind: "write", poster: frame });
    expect(calls).toEqual(["frame"]);
  });

  it("keeps the current poster when no candidate matches the video", async () => {
    const { candidates } = posterCandidates({
      platform: posterWrite(1280, 720, COVER_URL),
      frame: posterWrite(1920, 1080),
    });

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: true, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "keep" });
  });

  it("fills an empty slot with the platform cover when no candidate matches", async () => {
    const cover = posterWrite(1280, 720, COVER_URL);
    const { candidates } = posterCandidates({ platform: cover });

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: false, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "write", poster: cover });
  });

  it("writes the platform cover when the video has no dimensions", async () => {
    const cover = posterWrite(1280, 720, COVER_URL);
    const { calls, candidates } = posterCandidates({ platform: cover });

    await expect(
      chooseVideoPoster(
        { video: {}, hasPoster: true, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "write", poster: cover });
    expect(calls).toEqual(["platform"]);
  });

  it("reports none when no poster can be produced", async () => {
    const { candidates } = posterCandidates({});

    await expect(
      chooseVideoPoster(
        { video: portraitVideo, hasPoster: true, usePlatform: true },
        candidates,
      ),
    ).resolves.toEqual({ kind: "none" });
  });
});

/** Serves i.ytimg.com as recorded: bare files at their probed size, signed files at the size their player response lists. */
function recordedImageHost(id: string) {
  const recorded = recordedShort(id);
  const listed = new Map<string, { width: number; height: number }>();
  for (const player of [recorded.shortsPlayer, recorded.watchPlayer]) {
    for (const entry of player.microformat.playerMicroformatRenderer.thumbnail
      .thumbnails) {
      listed.set(entry.url, entry);
    }
  }
  return async (url: string) => {
    const parsed = new URL(url);
    const file = parsed.pathname.split("/").at(-1) ?? "";
    const dims = parsed.search ? listed.get(url) : recorded.images[file];
    if (!dims) return { miss: "permanent" as const };
    return image(
      await jpeg(Math.round(dims.width / 10), Math.round(dims.height / 10)),
    );
  };
}

/** The upright cover the Shorts player response lists, as harvest records it. */
function tallestPortrait(player: RecordedPlayer): string {
  const thumbs =
    player.microformat.playerMicroformatRenderer.thumbnail.thumbnails
      .filter((thumb) => thumb.height > thumb.width)
      .sort((a, b) => b.height - a.height);
  const url = thumbs[0]?.url;
  if (!url) throw new Error("no portrait thumbnail");
  return url;
}

function shortSave(id: string, posterUrl: string) {
  return save({
    rawJson: storedAsRawJson({
      capture: {
        id,
        source: "youtube",
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: Number(
          recordedShort(id).shortsPlayer.videoDetails.lengthSeconds,
        ),
        media: [
          {
            type: "video",
            url: `https://www.youtube.com/watch?v=${id}`,
            posterUrl,
          },
        ],
      },
    }),
  });
}

async function writtenPosterUrl(id: string, posterUrl: string) {
  const { runtime } = recordingRuntime(recordedImageHost(id));
  const written: Array<string | undefined> = [];
  await ensureRemotePoster("s1", shortSave(id, posterUrl), false, {
    ...runtime,
    persistSave: async (...[id, patch, options]: PersistArgs) => {
      written.push(...(options?.newFiles ?? []).map((file) => file.sourceUrl));
      return runtime.persistSave(id, patch, options);
    },
  });
  return written[0];
}

function thumb(id: string, file: string): string {
  return `https://i.ytimg.com/vi/${id}/${file}`;
}

describe("ensureRemotePoster with recorded YouTube Shorts", () => {
  it.each([
    ["-st95jSkprQ", "oardefault.jpg"],
    ["m6CRWM9sUzU", "sardefault.jpg"],
  ])(
    "upgrades %s's Shorts player cover to the full-size %s",
    async (id, file) => {
      const shorts = recordedShort(id).shortsPlayer;
      expect(await writtenPosterUrl(id, tallestPortrait(shorts))).toBe(
        thumb(id, file),
      );
    },
  );

  it("keeps the signed portrait crop whose bare file is the landscape composite", async () => {
    const shorts = recordedShort("dbXWZjYJ8t8").shortsPlayer;
    const crop = tallestPortrait(shorts);
    expect(new URL(crop).pathname).toBe("/vi/dbXWZjYJ8t8/hq720.jpg");
    expect(await writtenPosterUrl("dbXWZjYJ8t8", crop)).toBe(crop);
  });

  it.each([
    ["-st95jSkprQ", "oardefault.jpg"],
    ["m6CRWM9sUzU", "sardefault.jpg"],
    ["dbXWZjYJ8t8", "oar2.jpg"],
  ])(
    "repairs %s from the watch page's landscape poster with %s",
    async (id, file) => {
      const watch = recordedShort(id).watchPlayer;
      const landscape =
        watch.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0]
          ?.url;
      if (!landscape) throw new Error(`no recording for ${id}`);
      expect(await writtenPosterUrl(id, landscape)).toBe(thumb(id, file));
    },
  );
});
