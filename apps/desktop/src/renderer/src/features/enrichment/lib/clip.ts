import type { RawImage } from "@huggingface/transformers";
import { mediaEmbeddingVersion } from "@shared/embeddings";
import {
  inferClipAesthetic,
  inferClipImage,
  inferEmbedAudio,
  inferEmbedVideoFrames,
} from "./inference-client";
import type { VideoEmbeddingFrame } from "./inference-client";

export function mediaModelVersion(): string {
  return mediaEmbeddingVersion();
}

const AESTHETIC_LABELS = [
  "minimalist",
  "maximalist",
  "vintage",
  "modern",
  "brutalist",
  "colorful",
  "monochrome",
  "dark",
  "bright",
  "illustration",
  "photograph",
  "3d render",
  "diagram",
  "screenshot",
  "typography",
] as const;

export function mediaImageEmbedding(image: RawImage): Promise<Float32Array> {
  return inferClipImage(image);
}

export function mediaAudioEmbedding(
  audio: Float32Array,
): Promise<Float32Array> {
  return inferEmbedAudio(audio);
}

export function mediaVideoEmbedding(
  frames: Array<VideoEmbeddingFrame>,
  duration: number,
): Promise<Float32Array> {
  return inferEmbedVideoFrames(frames, duration);
}

export function clipAesthetic(image: RawImage): Promise<Array<string>> {
  return inferClipAesthetic(image, [...AESTHETIC_LABELS]);
}
