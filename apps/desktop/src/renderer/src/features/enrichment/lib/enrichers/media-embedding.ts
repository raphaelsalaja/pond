import type { RawImage } from "@huggingface/transformers";
import {
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
} from "@shared/embeddings";
import { setMediaEmbedding } from "@/features/enrichment/state/media-embedding-store";
import {
  buildPondUrl,
  deriveTypeKind,
  pickPrimaryFile,
  pickPrimaryUnit,
} from "@/features/saves/media";
import type { Save } from "@/features/saves/types";
import {
  mediaAudioEmbedding,
  mediaImageEmbedding,
  mediaVideoEmbedding,
} from "../clip";
import { loadImage, representativeImageUrl } from "../image";
import { MAX_EMBEDDING_AUDIO_SAMPLES } from "../inference-client";
import type { VideoEmbeddingFrame } from "../inference-client";
import type { Enricher } from "../types";
import { decodeMono16k } from "../whisper";
import type { DecodeMono16kOptions } from "../whisper";

export const MEDIA_EMBEDDING_AUDIO_OPTIONS = {
  maxSamples: MAX_EMBEDDING_AUDIO_SAMPLES,
} as const satisfies DecodeMono16kOptions;

export const MEDIA_EMBEDDING_VIDEO_OPTIONS = {
  fps: 1,
  maxFrames: 32,
  maxDurationSeconds: 32,
} as const;

interface SampledVideo {
  frames: Array<VideoEmbeddingFrame>;
  duration: number;
}

interface VideoSampleOptions {
  fps: 1;
  maxFrames: 32;
  maxDurationSeconds: 32;
}

export interface MediaEmbeddingDependencies {
  loadImage(url: string): Promise<RawImage>;
  decodeAudio(
    url: string,
    options: DecodeMono16kOptions,
  ): Promise<Float32Array>;
  sampleVideo(
    url: string,
    options: VideoSampleOptions,
  ): Promise<SampledVideo | null>;
  embedImage(image: RawImage): Promise<Float32Array>;
  embedAudio(audio: Float32Array): Promise<Float32Array>;
  embedVideoFrames(
    frames: Array<VideoEmbeddingFrame>,
    duration: number,
  ): Promise<Float32Array>;
  persist(id: string, vector: Float32Array, model: string): Promise<void>;
}

type EmbeddableMedia = "image" | "audio" | "video";

function mediaKind(save: Save): EmbeddableMedia | null {
  if (
    save.mediaType === "image" ||
    save.mediaType === "audio" ||
    save.mediaType === "video"
  ) {
    return save.mediaType;
  }
  const derived = deriveTypeKind(pickPrimaryFile(save), save);
  return derived === "image" || derived === "audio" || derived === "video"
    ? derived
    : null;
}

function mediaUrl(save: Save, kind: EmbeddableMedia): string | null {
  if (kind === "image") {
    return representativeImageUrl(save);
  }
  if (kind === "video") {
    const unit = pickPrimaryUnit(save);
    if (unit?.isVideo) {
      return unit.url;
    }
  }
  const file = pickPrimaryFile(save);
  return file ? buildPondUrl(save.id, file) : null;
}

function normalize(vector: Float32Array): Float32Array {
  return Float32Array.from(normalizedEmbeddingVector(vector));
}

function normalizedMean(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length !== right.length) {
    throw new Error("media embeddings must have matching dimensions");
  }
  const mean = Float32Array.from(
    left,
    (value, index) => value + (right[index] ?? 0),
  );
  return normalize(mean);
}

async function rawImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<RawImage> {
  const { RawImage } = await import("@huggingface/transformers");
  return RawImage.fromBlob(
    new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }),
  );
}

function isSampledDuration(value: unknown): value is number {
  return typeof value === "number";
}

async function sampleVideo(
  url: string,
  options: VideoSampleOptions,
): Promise<SampledVideo | null> {
  const result = await window.pond.query("video.sampleFrames", {
    src: url,
    maxFrames: options.maxFrames,
    strategy: "embedding",
  });
  if (
    !result.ok ||
    !isSampledDuration(result.duration) ||
    result.frames.length === 0
  ) {
    return null;
  }
  const decoded = await Promise.all(
    result.frames.map(async (frame) => ({
      image: await rawImage(frame.bytes, frame.mimeType),
      timestamp: frame.timestamp,
    })),
  );
  return {
    frames: decoded,
    duration: Math.min(result.duration, options.maxDurationSeconds),
  };
}

const defaultDependencies: MediaEmbeddingDependencies = {
  loadImage,
  decodeAudio: decodeMono16k,
  sampleVideo,
  embedImage: mediaImageEmbedding,
  embedAudio: mediaAudioEmbedding,
  embedVideoFrames: mediaVideoEmbedding,
  persist: setMediaEmbedding,
};

export function createMediaEmbeddingEnricher(
  dependencies: MediaEmbeddingDependencies,
): Enricher {
  return {
    id: "clip",
    enabled: (prefs) => prefs?.ai?.enableClip === true,
    eligible(save: Save) {
      if (save.status !== "complete" || save.deletedAt !== null) {
        return false;
      }
      if (!mediaKind(save)) {
        return false;
      }
      return save.clipModel !== mediaEmbeddingVersion();
    },
    async run(save: Save) {
      const kind = mediaKind(save);
      if (!kind) {
        return null;
      }
      const url = mediaUrl(save, kind);
      if (!url) {
        return null;
      }

      let vector: Float32Array;
      if (kind === "image") {
        vector = await dependencies.embedImage(
          await dependencies.loadImage(url),
        );
      } else if (kind === "audio") {
        const audio = await dependencies.decodeAudio(
          url,
          MEDIA_EMBEDDING_AUDIO_OPTIONS,
        );
        vector = await dependencies.embedAudio(audio);
      } else {
        const sampled = await dependencies.sampleVideo(
          url,
          MEDIA_EMBEDDING_VIDEO_OPTIONS,
        );
        if (!sampled) {
          return null;
        }
        const frameVector = normalize(
          await dependencies.embedVideoFrames(sampled.frames, sampled.duration),
        );
        let audio: Float32Array | null = null;
        try {
          audio = await dependencies.decodeAudio(
            url,
            MEDIA_EMBEDDING_AUDIO_OPTIONS,
          );
        } catch {
          /** Video containers without a decodable audio track remain searchable by frames. */
        }
        vector = audio
          ? normalizedMean(
              frameVector,
              normalize(await dependencies.embedAudio(audio)),
            )
          : frameVector;
      }

      const normalized = normalize(vector);
      const model = mediaEmbeddingVersion();
      await dependencies.persist(save.id, normalized, model);
      return { optimistic: { clipModel: model } };
    },
  };
}

export const mediaEmbeddingEnricher =
  createMediaEmbeddingEnricher(defaultDependencies);
