import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  env,
  Florence2ForConditionalGeneration,
  pipeline,
  RawVideo,
  RawVideoFrame,
} from "@huggingface/transformers";
import type {
  Florence2Processor,
  PreTrainedModel,
  PreTrainedTokenizer,
  Processor,
  RawImage,
  Tensor,
} from "@huggingface/transformers";
import type { JsonValue } from "@pond/schema/json";
import {
  embeddingClassificationLabel,
  embeddingDimensions,
  normalizedEmbeddingVector,
  tokenizeEmbeddingTexts,
} from "@shared/embeddings";
import {
  EMBEDDING_MODEL,
  IMAGE_MODEL,
  TRANSCRIPTION_MODEL,
} from "@shared/on-device-models";
import { z } from "zod";
import { pickDevice } from "@/features/enrichment/lib/inference-device";
import { unitCosine } from "@/shared/lib/vector";
import { createEmbeddingProfileCache } from "./embedding-profile";
import type {
  EmbeddingProfile,
  LoadedEmbeddingProfile,
} from "./embedding-profile";

export type FlorenceTask = "<CAPTION>" | "<DETAILED_CAPTION>" | "<OCR>";

/** Processors and models return tensors plus plain size metadata. */
type ModelInputs = Record<string, Tensor | JsonValue>;

function isModelRecord(value: unknown): value is ModelInputs {
  return typeof value === "object" && value !== null;
}

function isTensor(value: unknown): value is Tensor {
  return (
    typeof value === "object" &&
    value !== null &&
    "dims" in value &&
    "data" in value &&
    "dispose" in value &&
    typeof value.dispose === "function"
  );
}

function isFlorenceProcessor(
  processor: Processor,
): processor is Florence2Processor {
  return (
    "construct_prompts" in processor && "post_process_generation" in processor
  );
}

function assertModelInputs(value: unknown): asserts value is ModelInputs {
  if (!isModelRecord(value)) {
    throw new Error("[inference] processor returned no model inputs");
  }
}

async function withDevice<T>(
  tag: string,
  build: (device: "webgpu" | "wasm") => Promise<T>,
): Promise<T> {
  env.allowLocalModels = false;
  if ((await pickDevice()) === "webgpu") {
    try {
      return await build("webgpu");
    } catch (error) {
      // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
      console.warn(`[${tag}] WebGPU build failed; using WASM`, error);
    }
  }
  return build("wasm");
}

function memo<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const p = load();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

interface FlorenceBundle {
  model: PreTrainedModel;
  processor: Florence2Processor;
  tokenizer: PreTrainedTokenizer;
}

const florenceCache = new Map<string, Promise<FlorenceBundle>>();
function getFlorence(): Promise<FlorenceBundle> {
  return memo(florenceCache, IMAGE_MODEL.revision, () =>
    withDevice("florence", async (device) => {
      const model = await Florence2ForConditionalGeneration.from_pretrained(
        IMAGE_MODEL.id,
        {
          revision: IMAGE_MODEL.revision,
          device,
          dtype:
            device === "webgpu"
              ? {
                  embed_tokens: "fp16",
                  vision_encoder: "fp16",
                  encoder_model: "fp16",
                  decoder_model_merged: "q4",
                }
              : "q8",
        },
      );
      const processor = await AutoProcessor.from_pretrained(IMAGE_MODEL.id, {
        revision: IMAGE_MODEL.revision,
      });
      if (!isFlorenceProcessor(processor)) {
        throw new Error(
          `[florence] ${IMAGE_MODEL.id} has no Florence-2 processor`,
        );
      }
      const tokenizer = await AutoTokenizer.from_pretrained(IMAGE_MODEL.id, {
        revision: IMAGE_MODEL.revision,
      });
      // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
      console.info(`[florence] ready (${device})`);
      return { model, processor, tokenizer };
    }),
  );
}

const CaptionSchema = z.string().catch("");

export async function coreFlorence(
  image: RawImage,
  task: FlorenceTask,
): Promise<string> {
  const { model, processor, tokenizer } = await getFlorence();
  const prompts = processor.construct_prompts(task);
  const inputs: unknown = await processor(image, prompts);
  assertModelInputs(inputs);
  try {
    const generated = await model.generate({
      ...inputs,
      max_new_tokens: 256,
      num_beams: 1,
      do_sample: false,
    });
    if (!isTensor(generated)) {
      return "";
    }
    try {
      const decoded = tokenizer.batch_decode(generated, {
        skip_special_tokens: false,
      });
      const result = processor.post_process_generation(decoded[0] ?? "", task, [
        image.width,
        image.height,
      ]);
      return CaptionSchema.parse(result[task]).trim();
    } finally {
      generated.dispose();
    }
  } finally {
    disposeTensors(inputs);
  }
}

interface EmbeddingBundle extends LoadedEmbeddingProfile {
  model: PreTrainedModel;
  processor: Processor;
  tokenizer: PreTrainedTokenizer;
}

async function loadEmbeddingBundle(
  profile: EmbeddingProfile,
): Promise<EmbeddingBundle> {
  return withDevice("embedding-gemma", async (device) => {
    const options = { revision: EMBEDDING_MODEL.revision };
    const config = await AutoConfig.from_pretrained(
      EMBEDDING_MODEL.id,
      options,
    );
    const model = await AutoModel.from_pretrained(EMBEDDING_MODEL.id, {
      ...options,
      config,
      device,
      dtype: "q4",
    });
    try {
      const [processor, tokenizer] = await Promise.all([
        AutoProcessor.from_pretrained(EMBEDDING_MODEL.id, options),
        AutoTokenizer.from_pretrained(EMBEDDING_MODEL.id, options),
      ]);
      // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
      console.info(`[embedding-gemma] multimodal ready (${device}/q4)`);
      return {
        model,
        processor,
        profile,
        tokenizer,
        async dispose() {
          await model.dispose();
        },
      };
    } catch (error) {
      await model.dispose();
      throw error;
    }
  });
}

const embeddingProfiles = createEmbeddingProfileCache(loadEmbeddingBundle);

const EmbeddingRowsSchema = z.array(z.array(z.number()));

function sentenceEmbeddingRows(
  output: ModelInputs,
  expectedRows: number,
): Array<Float32Array> {
  const tensor = output.sentence_embedding;
  if (!isTensor(tensor)) {
    throw new Error("[embedding-gemma] model returned no sentence embedding");
  }
  try {
    const rows = EmbeddingRowsSchema.parse(tensor.tolist());
    if (rows.length !== expectedRows) {
      throw new Error(
        `[embedding-gemma] expected ${expectedRows} embedding rows, received ${rows.length}`,
      );
    }
    return rows.map((row) => Float32Array.from(normalizedEmbeddingVector(row)));
  } finally {
    disposeTensors(output);
  }
}

async function runEmbedding(
  model: PreTrainedModel,
  inputs: ModelInputs,
  expectedRows: number,
): Promise<Array<Float32Array>> {
  try {
    const output: unknown = await model(inputs);
    if (!isModelRecord(output)) {
      throw new Error("[embedding-gemma] model returned no sentence embedding");
    }
    return sentenceEmbeddingRows(output, expectedRows);
  } finally {
    disposeTensors(inputs);
  }
}

function disposeTensors(values: ModelInputs): void {
  for (const value of Object.values(values)) {
    if (isTensor(value)) {
      value.dispose();
    }
  }
}

export async function coreClipImage(image: RawImage): Promise<Float32Array> {
  return embeddingProfiles.use("text-image", async ({ model, processor }) => {
    const inputs: unknown = await processor(null, image);
    assertModelInputs(inputs);
    const [vector] = await runEmbedding(model, inputs, 1);
    if (!vector) {
      throw new Error("[embedding-gemma] model returned no image embedding");
    }
    return vector;
  });
}

export async function coreClipAesthetic(
  image: RawImage,
  labels: Array<string>,
  threshold = 0.2,
  topN = 3,
): Promise<Array<string>> {
  const [imageVector, labelVectors] = await Promise.all([
    coreClipImage(image),
    coreEmbedTexts(labels.map(embeddingClassificationLabel)),
  ]);
  return labels
    .flatMap((label, index) => {
      const score = unitCosine(
        imageVector,
        labelVectors[index] ?? new Float32Array(),
      );
      return score >= threshold ? [{ label, score }] : [];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topN)
    .map((result) => result.label);
}

export async function coreSensitiveContent(
  images: Array<RawImage>,
): Promise<Array<number>> {
  const { runSensitiveModel } = await import("./sensitive-model");
  return runSensitiveModel(images);
}

export async function coreEmbedText(text: string): Promise<Float32Array> {
  const [vector] = await coreEmbedTexts([text]);
  if (!vector) {
    throw new Error("[embedding-gemma] model returned no text embedding");
  }
  return vector;
}

export async function coreEmbedTexts(
  texts: Array<string>,
): Promise<Array<Float32Array>> {
  if (texts.length === 0) {
    return [];
  }
  return embeddingProfiles.use("text-image", async ({ model, tokenizer }) => {
    const inputs: unknown = tokenizeEmbeddingTexts(
      (batch, options) => tokenizer(batch, options),
      texts,
    );
    assertModelInputs(inputs);
    return runEmbedding(model, inputs, texts.length);
  });
}

export async function coreEmbedAudio(
  audio: Float32Array,
): Promise<Float32Array> {
  return embeddingProfiles.use("text-audio", async ({ model, processor }) => {
    const inputs: unknown = await processor(null, null, audio);
    assertModelInputs(inputs);
    const [vector] = await runEmbedding(model, inputs, 1);
    if (!vector) {
      throw new Error("[embedding-gemma] model returned no audio embedding");
    }
    return vector;
  });
}

export async function coreEmbedVideoFrames(
  frames: Array<{ image: RawImage; timestamp: number }>,
  duration: number,
): Promise<Float32Array> {
  return embeddingProfiles.use("text-image", async ({ model, processor }) => {
    if (frames.length === 0) throw new Error("Video has no frames");
    const combined = new Float32Array(embeddingDimensions());
    /** Batching bounds attention and vision scratch space instead of allocating one graph for all 32 frames. */
    const batchSize = 16;
    for (let start = 0; start < frames.length; start += batchSize) {
      const batch = frames.slice(start, start + batchSize);
      const first = batch[0];
      const last = batch.at(-1);
      if (!first || !last) continue;
      const video = new RawVideo(
        batch.map(
          (frame) =>
            new RawVideoFrame(frame.image, frame.timestamp - first.timestamp),
        ),
        Math.min(
          duration - first.timestamp,
          last.timestamp - first.timestamp + 1,
        ),
      );
      const inputs: unknown = await processor(null, null, null, video);
      assertModelInputs(inputs);
      const [vector] = await runEmbedding(model, inputs, 1);
      if (!vector) {
        throw new Error("[embedding-gemma] model returned no video embedding");
      }
      const weight = batch.length / frames.length;
      for (let index = 0; index < combined.length; index += 1) {
        combined[index] =
          (combined[index] ?? 0) + (vector[index] ?? 0) * weight;
      }
    }
    return Float32Array.from(normalizedEmbeddingVector(combined));
  });
}

type Transcriber = Awaited<
  ReturnType<typeof pipeline<"automatic-speech-recognition">>
>;

const transcriberCache = new Map<string, Promise<Transcriber>>();
function getTranscriber(): Promise<Transcriber> {
  return memo(transcriberCache, TRANSCRIPTION_MODEL.revision, () =>
    withDevice("whisper", async (device) => {
      const pipe = await pipeline(
        "automatic-speech-recognition",
        TRANSCRIPTION_MODEL.id,
        {
          revision: TRANSCRIPTION_MODEL.revision,
          device,
          dtype: device === "webgpu" ? "fp16" : "q8",
        },
      );
      // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
      console.info(`[whisper] ready (${device})`);
      return pipe;
    }),
  );
}

const TranscriptChunkSchema = z
  .object({ text: z.string().optional() })
  .catch({});

export async function coreTranscribe(audio: Float32Array): Promise<string> {
  const transcriber = await getTranscriber();
  const out = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    task: "transcribe",
  });
  const chunks: Array<unknown> = Array.isArray(out) ? out : [out];
  return chunks
    .map((chunk) => TranscriptChunkSchema.parse(chunk).text ?? "")
    .join(" ")
    .trim();
}

export async function disposeInferenceModels(): Promise<void> {
  await embeddingProfiles.dispose();
  for (const bundle of florenceCache.values()) {
    await (await bundle).model.dispose();
  }
  florenceCache.clear();
  for (const transcriber of transcriberCache.values()) {
    await (await transcriber).dispose();
  }
  transcriberCache.clear();
  const { disposeSensitiveModel } = await import("./sensitive-model");
  await disposeSensitiveModel();
}
