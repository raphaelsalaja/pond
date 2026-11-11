import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { ensureRemotePoster, type RemotePosterSave } from "./ensure-poster";

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

async function setup() {
  const bytes = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "#000" },
  })
    .jpeg()
    .toBuffer();
  const fetchAvatarToTxFile = vi.fn(async () => ({
    file: { filename: "poster.jpg", bytes, mimeType: "image/jpeg" },
  }));
  const persistSave = vi.fn(async () => null);
  const ensureSaveThumbnail = vi.fn(async () => {});
  return {
    runtime: { fetchAvatarToTxFile, persistSave, ensureSaveThumbnail },
    fetchAvatarToTxFile,
    persistSave,
    ensureSaveThumbnail,
  };
}

function save(overrides: Partial<RemotePosterSave> = {}): RemotePosterSave {
  return { files: [], rawJson: videoCapture, mediaUrl: null, ...overrides };
}

describe("ensureRemotePoster", () => {
  it("writes the captured poster when the save has no video file", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave, ensureSaveThumbnail } =
      await setup();

    await ensureRemotePoster("s1", save(), false, runtime);

    expect(fetchAvatarToTxFile).toHaveBeenCalledWith(POSTER_URL);
    expect(persistSave).toHaveBeenCalledWith(
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
    );
    expect(ensureSaveThumbnail).toHaveBeenCalledWith("s1", null, {
      force: true,
    });
  });

  it("does nothing when no poster URL is known", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave } = await setup();

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

    expect(fetchAvatarToTxFile).not.toHaveBeenCalled();
    expect(persistSave).not.toHaveBeenCalled();
  });

  it("uses a portrait Shorts file and skips a landscape original-aspect file", async () => {
    const landscape = await jpeg(4, 2);
    const portrait = await jpeg(2, 4);
    const id = "a88WoGBL1Mc";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const oar2 = `https://i.ytimg.com/vi/${id}/oar2.jpg`;
    const oardefault = `https://i.ytimg.com/vi/${id}/oardefault.jpg`;
    const fetchAvatarToTxFile = vi.fn(async (url: string) => {
      if (url === oar2) return image(landscape);
      if (url === oardefault) return image(portrait);
      return { miss: "permanent" as const };
    });
    const persistSave = vi.fn(async () => null);
    const ensureSaveThumbnail = vi.fn(async () => {});

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
      { fetchAvatarToTxFile, persistSave, ensureSaveThumbnail },
    );

    expect(fetchAvatarToTxFile.mock.calls.map((call) => call[0])).toEqual([
      oar2,
      oardefault,
    ]);
    expect(persistSave).toHaveBeenCalledWith(
      "s1",
      {},
      expect.objectContaining({
        newFiles: [expect.objectContaining({ width: 2, height: 4 })],
      }),
    );
  });

  it("keeps the current thumbnail when every Shorts candidate is landscape", async () => {
    const landscape = await jpeg(4, 2);
    const id = "dQw4w9WgXcQ";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const fetchAvatarToTxFile = vi.fn(async (url: string) =>
      url === `https://i.ytimg.com/vi/${id}/oardefault.jpg`
        ? { miss: "permanent" as const }
        : image(landscape),
    );
    const persistSave = vi.fn(async () => null);

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
      {
        fetchAvatarToTxFile,
        persistSave,
        ensureSaveThumbnail: vi.fn(async () => {}),
      },
    );

    expect(persistSave).toHaveBeenCalledWith(
      "s1",
      {},
      expect.objectContaining({
        newFiles: [expect.objectContaining({ width: 4, height: 2 })],
      }),
    );
  });

  it("does not probe upright files for a longer YouTube video", async () => {
    const id = "dQw4w9WgXcQ";
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const { runtime, fetchAvatarToTxFile } = await setup();

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

    expect(fetchAvatarToTxFile).toHaveBeenCalledTimes(1);
    expect(fetchAvatarToTxFile).toHaveBeenCalledWith(hq);
  });

  it("keeps an existing poster unless forced", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave } = await setup();

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      false,
      runtime,
    );
    expect(fetchAvatarToTxFile).not.toHaveBeenCalled();

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      true,
      runtime,
    );
    expect(persistSave).toHaveBeenCalledOnce();
  });
});
