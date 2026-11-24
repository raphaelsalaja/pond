import { RawImage } from "@huggingface/transformers";
import { mediaEmbeddingVersion } from "@shared/embeddings";
import { describe, expect, it, vi } from "vitest";
import type { Save } from "@/features/saves/types";
import {
  createMediaEmbeddingEnricher,
  MEDIA_EMBEDDING_AUDIO_OPTIONS,
  MEDIA_EMBEDDING_VIDEO_OPTIONS,
} from "./media-embedding";
import type { MediaEmbeddingDependencies } from "./media-embedding";

function save(
  mediaType: Save["mediaType"],
  path: string,
  mimeType: string,
  clipModel: string | null = null,
): Save {
  return {
    id: `save-${mediaType}`,
    source: "local",
    sourceId: `source-${mediaType}`,
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType,
    files: [
      {
        kind: "media",
        path,
        sha256: "hash",
        size: 1,
        mimeType,
      },
    ],
    tags: [],
    status: "complete",
    clipModel,
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
  };
}

function image(value = 10): RawImage {
  return new RawImage(
    new Uint8ClampedArray([value, value, value, 255]),
    1,
    1,
    4,
  );
}

function unitVector(index: number): Float32Array {
  const vector = new Float32Array(768);
  vector[index] = 1;
  return vector;
}

function dependencies(
  overrides: Partial<MediaEmbeddingDependencies> = {},
): MediaEmbeddingDependencies {
  return {
    loadImage: async () => image(),
    decodeAudio: async () => new Float32Array([0.25]),
    sampleVideo: async () => ({
      duration: 2,
      frames: [
        { image: image(10), timestamp: 0 },
        { image: image(20), timestamp: 1 },
      ],
    }),
    embedImage: async () => unitVector(0),
    embedAudio: async () => unitVector(0),
    embedVideoFrames: async () => unitVector(0),
    persist: async () => {},
    ...overrides,
  };
}

describe("media embedding enricher", () => {
  it("indexes stale image, audio, and video Saves but not documents", () => {
    const enricher = createMediaEmbeddingEnricher(dependencies());

    expect(enricher.eligible(save("image", "image.jpg", "image/jpeg"))).toBe(
      true,
    );
    expect(enricher.eligible(save("audio", "audio.wav", "audio/wav"))).toBe(
      true,
    );
    expect(enricher.eligible(save("video", "video.mp4", "video/mp4"))).toBe(
      true,
    );
    expect(
      enricher.eligible(save("document", "document.pdf", "application/pdf")),
    ).toBe(false);
    expect(
      enricher.eligible(
        save("image", "image.jpg", "image/jpeg", mediaEmbeddingVersion()),
      ),
    ).toBe(false);
  });

  it("decodes bounded mono audio and persists one vector", async () => {
    const decodeAudio = vi.fn(async () => new Float32Array([0.25]));
    const persist = vi.fn(
      async (_id: string, _vector: Float32Array, _model: string) => {},
    );
    const enricher = createMediaEmbeddingEnricher(
      dependencies({ decodeAudio, persist }),
    );

    await expect(
      enricher.run(save("audio", "audio.wav", "audio/wav")),
    ).resolves.toEqual({
      optimistic: { clipModel: mediaEmbeddingVersion() },
    });
    expect(decodeAudio).toHaveBeenCalledWith(
      expect.stringMatching(/^pond:\/\//),
      MEDIA_EMBEDDING_AUDIO_OPTIONS,
    );
    expect(persist).toHaveBeenCalledWith(
      "save-audio",
      unitVector(0),
      mediaEmbeddingVersion(),
    );
  });

  it("samples video at the bounded contract and normalized-means frame and audio vectors", async () => {
    const events: Array<string> = [];
    const sampleVideo = vi.fn(async () => ({
      duration: 2,
      frames: [
        { image: image(10), timestamp: 0 },
        { image: image(20), timestamp: 1 },
      ],
    }));
    const persist = vi.fn(
      async (_id: string, _vector: Float32Array, _model: string) => {},
    );
    const enricher = createMediaEmbeddingEnricher(
      dependencies({
        sampleVideo,
        embedVideoFrames: async () => {
          events.push("video");
          return unitVector(0);
        },
        embedAudio: async () => {
          events.push("audio");
          return unitVector(1);
        },
        persist,
      }),
    );

    await enricher.run(save("video", "video.mp4", "video/mp4"));

    expect(sampleVideo).toHaveBeenCalledWith(
      expect.stringMatching(/^pond:\/\//),
      MEDIA_EMBEDDING_VIDEO_OPTIONS,
    );
    expect(events).toEqual(["video", "audio"]);
    const written = persist.mock.calls[0]?.[1];
    expect(written?.[0]).toBeCloseTo(Math.SQRT1_2);
    expect(written?.[1]).toBeCloseTo(Math.SQRT1_2);
    expect(written).toHaveLength(768);
  });

  it("preserves the stored vector and model when inference fails", async () => {
    const oldVector = unitVector(2);
    const oldModel = "old-media-model";
    const persist = vi.fn(
      async (_id: string, _vector: Float32Array, _model: string) => {},
    );
    const enricher = createMediaEmbeddingEnricher(
      dependencies({
        embedAudio: async () => {
          throw new Error("inference failed");
        },
        persist,
      }),
    );
    const target = {
      ...save("audio", "audio.wav", "audio/wav", oldModel),
      clipEmbedding: Array.from(oldVector),
    };

    await expect(enricher.run(target)).rejects.toThrow("inference failed");
    expect(persist).not.toHaveBeenCalled();
    expect(target.clipEmbedding).toEqual(Array.from(oldVector));
    expect(target.clipModel).toBe(oldModel);
  });
});
