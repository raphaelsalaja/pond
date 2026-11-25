import type { RawImage } from "@huggingface/transformers";
import log from "electron-log/renderer";
import { z } from "zod";
import type { FlorenceTask } from "./inference-core";
import type {
  InferenceRequest,
  InferenceResponse,
  InferenceResult,
  SerializedImage,
  SerializedVideoFrame,
} from "./inference-protocol";

/** Main-thread client for the inference Web Worker. In-thread fallback is only for a worker that never started, not one that died mid-run; Whisper in the UI renderer has crashed the process (exit 5). */

function serializeImage(image: RawImage): SerializedImage {
  const copy = new Uint8ClampedArray(image.data);
  return {
    data: copy.buffer,
    width: image.width,
    height: image.height,
    channels: image.channels,
  };
}

interface Pending {
  resolve(value: InferenceResult): void;
  reject(error: Error): void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type RequestBody = DistributiveOmit<InferenceRequest, "id">;

const EMBEDDING_AUDIO_SAMPLE_RATE = 16_000;
const MAX_EMBEDDING_AUDIO_SECONDS = 30;
export const MAX_EMBEDDING_AUDIO_SAMPLES =
  EMBEDDING_AUDIO_SAMPLE_RATE * MAX_EMBEDDING_AUDIO_SECONDS;
export const MAX_EMBEDDING_VIDEO_FRAMES = 32;
export const MAX_EMBEDDING_VIDEO_DURATION_SECONDS = 32;

export interface VideoEmbeddingFrame {
  image: RawImage;
  timestamp: number;
}

interface PreparedRequest<T extends RequestBody> {
  request: T;
  transfer: Array<Transferable>;
}

export function createAudioEmbeddingRequest(
  audio: Float32Array,
): PreparedRequest<{ op: "embedAudio"; audio: Float32Array }> {
  if (
    audio.length === 0 ||
    audio.length > MAX_EMBEDDING_AUDIO_SAMPLES ||
    !audio.every(Number.isFinite)
  ) {
    throw new Error(
      `audio must contain 1-${MAX_EMBEDDING_AUDIO_SAMPLES} finite mono 16 kHz samples`,
    );
  }
  const copy = audio.slice();
  return {
    request: { op: "embedAudio", audio: copy },
    transfer: [copy.buffer],
  };
}

export function createVideoEmbeddingRequest(
  frames: Array<VideoEmbeddingFrame>,
  duration: number,
): PreparedRequest<{
  op: "embedVideoFrames";
  frames: Array<SerializedVideoFrame>;
  duration: number;
}> {
  if (frames.length === 0 || frames.length > MAX_EMBEDDING_VIDEO_FRAMES) {
    throw new Error(
      `video must contain 1-${MAX_EMBEDDING_VIDEO_FRAMES} frames`,
    );
  }
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_EMBEDDING_VIDEO_DURATION_SECONDS
  ) {
    throw new Error(
      `video duration must be greater than 0 and at most ${MAX_EMBEDDING_VIDEO_DURATION_SECONDS} seconds`,
    );
  }

  let previousTimestamp = -1;
  for (const frame of frames) {
    if (
      !Number.isFinite(frame.timestamp) ||
      frame.timestamp < 0 ||
      frame.timestamp > duration ||
      frame.timestamp < previousTimestamp
    ) {
      throw new Error(
        "video frame timestamps must be finite, ordered, and within duration",
      );
    }
    previousTimestamp = frame.timestamp;
  }

  const serialized = frames.map((frame) => ({
    image: serializeImage(frame.image),
    timestamp: frame.timestamp,
  }));
  return {
    request: { op: "embedVideoFrames", frames: serialized, duration },
    transfer: serialized.map((frame) => frame.image.data),
  };
}

let worker: Worker | null = null;
let workerBroken = false;
let workerEverStarted = false;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let releaseWhenIdle = false;

export function releaseIdleInferenceWorker(): void {
  releaseWhenIdle = true;
  if (pending.size > 0) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  releaseWhenIdle = false;
  const current = worker;
  if (!current) return;
  const id = nextId++;
  const finish = (): void => {
    if (pending.size === 0 && worker === current) {
      current.terminate();
      worker = null;
      releaseWhenIdle = false;
    }
  };
  pending.set(id, { resolve: finish, reject: finish });
  try {
    current.postMessage({ id, op: "dispose" } satisfies InferenceRequest);
  } catch {
    pending.delete(id);
    finish();
  }
}

function scheduleIdleRelease(): void {
  if (pending.size > 0 || !worker) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(
    releaseIdleInferenceWorker,
    releaseWhenIdle ? 0 : 15_000,
  );
}

function failAllPending(error: Error): void {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./inference-worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (event: MessageEvent<InferenceResponse>) => {
      const msg = event.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
      scheduleIdleRelease();
    };
    w.onerror = (event) => {
      log.error("[inference] worker crashed", event.message);
      workerBroken = true;
      worker?.terminate();
      worker = null;
      failAllPending(new Error("inference worker crashed"));
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };
    worker = w;
    workerEverStarted = true;
    return w;
  } catch (error) {
    log.error(
      "[inference] failed to start worker; using in-thread inference",
      error,
    );
    workerBroken = true;
    return null;
  }
}

const TextSchema = z.string();
const LabelsSchema = z.array(TextSchema);
const ScoresSchema = z.array(z.number());
const VectorSchema = z.instanceof(Float32Array);
const VectorsSchema = z.array(VectorSchema);

function callWorker<T extends InferenceResult>(
  result: z.ZodType<T>,
  msg: RequestBody,
  transfer: Array<Transferable>,
): Promise<T> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error("inference worker unavailable"));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => {
        try {
          resolve(result.parse(value));
        } catch (error) {
          reject(error);
        }
      },
      reject,
    });
    const request: InferenceRequest = { id, ...msg };
    try {
      w.postMessage(request, transfer);
    } catch (error) {
      pending.delete(id);
      scheduleIdleRelease();
      reject(error);
    }
  });
}

/** A model-level rejection while the worker is healthy propagates as-is. A worker that died mid-run must not resume on the UI thread. */
async function viaWorker<T>(
  run: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  if (workerBroken) {
    if (workerEverStarted) throw new Error("inference worker crashed");
    return fallback();
  }
  try {
    return await run();
  } catch (error) {
    if (workerBroken && workerEverStarted) {
      throw error;
    }
    if (workerBroken) {
      return fallback();
    }
    throw error;
  }
}

export function inferFlorence(
  image: RawImage,
  task: FlorenceTask,
): Promise<string> {
  return viaWorker(
    () => {
      const img = serializeImage(image);
      return callWorker(TextSchema, { op: "florence", image: img, task }, [
        img.data,
      ]);
    },
    async () => (await import("./inference-core")).coreFlorence(image, task),
  );
}

export function inferClipImage(image: RawImage): Promise<Float32Array> {
  return viaWorker(
    () => {
      const img = serializeImage(image);
      return callWorker(VectorSchema, { op: "clipImage", image: img }, [
        img.data,
      ]);
    },
    async () => (await import("./inference-core")).coreClipImage(image),
  );
}

export function inferClipAesthetic(
  image: RawImage,
  labels: Array<string>,
): Promise<Array<string>> {
  return viaWorker(
    () => {
      const img = serializeImage(image);
      return callWorker(
        LabelsSchema,
        { op: "clipAesthetic", image: img, labels },
        [img.data],
      );
    },
    async () =>
      (await import("./inference-core")).coreClipAesthetic(image, labels),
  );
}

export function inferSensitiveContent(
  images: Array<RawImage>,
): Promise<Array<number>> {
  return viaWorker(
    () => {
      const serialized = images.map(serializeImage);
      return callWorker(
        ScoresSchema,
        { op: "sensitiveContent", images: serialized },
        serialized.map((image) => image.data),
      );
    },
    async () => (await import("./inference-core")).coreSensitiveContent(images),
  );
}

export function inferEmbedText(text: string): Promise<Float32Array> {
  return viaWorker(
    () => callWorker(VectorSchema, { op: "embedText", text }, []),
    async () => (await import("./inference-core")).coreEmbedText(text),
  );
}

export function inferEmbedTexts(
  texts: Array<string>,
): Promise<Array<Float32Array>> {
  return viaWorker(
    () => callWorker(VectorsSchema, { op: "embedTexts", texts }, []),
    async () => (await import("./inference-core")).coreEmbedTexts(texts),
  );
}

export function inferEmbedAudio(audio: Float32Array): Promise<Float32Array> {
  const prepared = createAudioEmbeddingRequest(audio);
  return viaWorker(
    () => callWorker(VectorSchema, prepared.request, prepared.transfer),
    async () =>
      (await import("./inference-core")).coreEmbedAudio(prepared.request.audio),
  );
}

export function inferEmbedVideoFrames(
  frames: Array<VideoEmbeddingFrame>,
  duration: number,
): Promise<Float32Array> {
  const prepared = createVideoEmbeddingRequest(frames, duration);
  return viaWorker(
    () => callWorker(VectorSchema, prepared.request, prepared.transfer),
    async () =>
      (await import("./inference-core")).coreEmbedVideoFrames(frames, duration),
  );
}

export function inferTranscribe(audio: Float32Array): Promise<string> {
  return viaWorker(
    () => {
      const copy = audio.slice();
      return callWorker(TextSchema, { op: "transcribe", audio: copy }, [
        copy.buffer,
      ]);
    },
    async () => {
      throw new Error("whisper requires the inference worker");
    },
  );
}
