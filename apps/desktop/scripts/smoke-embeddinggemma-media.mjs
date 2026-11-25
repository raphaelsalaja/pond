import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  env,
  RawImage,
  RawVideo,
  RawVideoFrame,
} from "@huggingface/transformers";
import { z } from "zod";
import { EMBEDDING_MODEL } from "../src/shared/on-device-models.ts";

const AUDIO_SAMPLE_RATE = 16_000;
const EMBEDDING_DIMENSIONS = 768;
const MAX_AUDIO_SECONDS = 30;
const MAX_VIDEO_DURATION_SECONDS = 32;
const MAX_VIDEO_FRAMES = 32;

const VideoManifestSchema = z.object({
  duration: z.number().positive().max(MAX_VIDEO_DURATION_SECONDS),
  frames: z
    .array(z.object({ path: z.string(), timestamp: z.number().min(0) }))
    .min(1)
    .max(MAX_VIDEO_FRAMES),
});

function usage() {
  throw new Error(
    "Usage: node smoke-embeddinggemma-media.mjs (--audio <wav> | --video <frames.json>)",
  );
}

function parseArguments(argv) {
  if (argv.length !== 2) usage();
  const [flag, input] = argv;
  if (!input || (flag !== "--audio" && flag !== "--video")) usage();
  return { modality: flag.slice(2), input: resolve(input) };
}

function decodePcm16MonoWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset, length) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") {
    throw new Error("Audio fixture must be a RIFF/WAVE file");
  }

  let format;
  let dataOffset;
  let dataLength;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + size > bytes.byteLength) {
      throw new Error("Audio fixture has a truncated WAV chunk");
    }
    if (id === "fmt ") {
      format = {
        encoding: view.getUint16(payloadOffset, true),
        channels: view.getUint16(payloadOffset + 2, true),
        sampleRate: view.getUint32(payloadOffset + 4, true),
        bitsPerSample: view.getUint16(payloadOffset + 14, true),
      };
    } else if (id === "data") {
      dataOffset = payloadOffset;
      dataLength = size;
    }
    offset = payloadOffset + size + (size % 2);
  }

  if (
    format?.encoding !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== AUDIO_SAMPLE_RATE ||
    format.bitsPerSample !== 16 ||
    dataOffset === undefined ||
    dataLength === undefined
  ) {
    throw new Error("Audio fixture must be mono 16 kHz 16-bit PCM WAV");
  }
  if (dataLength % 2 !== 0) {
    throw new Error("Audio fixture has an invalid PCM payload");
  }
  const samples = new Float32Array(dataLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 32_768;
  }
  if (
    samples.length === 0 ||
    samples.length > AUDIO_SAMPLE_RATE * MAX_AUDIO_SECONDS
  ) {
    throw new Error(
      `Audio fixture must be between 0 and ${MAX_AUDIO_SECONDS} seconds`,
    );
  }
  return samples;
}

async function loadAudio(path) {
  return decodePcm16MonoWav(await readFile(path));
}

async function loadVideo(path) {
  const parsed = VideoManifestSchema.safeParse(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(
      `Video manifest must contain 1-${MAX_VIDEO_FRAMES} frames and a duration no greater than ${MAX_VIDEO_DURATION_SECONDS} seconds`,
    );
  }
  const manifest = parsed.data;

  const manifestDirectory = dirname(path);
  let previousTimestamp = -1;
  const frames = [];
  for (const frame of manifest.frames) {
    if (
      frame.timestamp > manifest.duration ||
      frame.timestamp < previousTimestamp
    ) {
      throw new Error(
        "Video frame paths and timestamps must be valid and ordered",
      );
    }
    previousTimestamp = frame.timestamp;
    frames.push(
      new RawVideoFrame(
        await RawImage.read(resolve(manifestDirectory, frame.path)),
        frame.timestamp,
      ),
    );
  }
  return new RawVideo(frames, manifest.duration);
}

async function modelSource(modality) {
  const cachedDirectory = resolve(
    env.cacheDir,
    EMBEDDING_MODEL.id,
    EMBEDDING_MODEL.revision,
  );
  const encoder =
    modality === "audio" ? "audio_encoder_q4.onnx" : "vision_encoder_q4.onnx";
  const requiredFiles = [
    "config.json",
    "processor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "onnx/model_q4.onnx",
    "onnx/model_q4.onnx_data",
    `onnx/${encoder}`,
    `onnx/${encoder}_data`,
  ];
  try {
    await Promise.all(
      requiredFiles.map((file) => access(resolve(cachedDirectory, file))),
    );
    return { id: cachedDirectory, options: {} };
  } catch {
    return {
      id: EMBEDDING_MODEL.id,
      options: { revision: EMBEDDING_MODEL.revision },
    };
  }
}

function embeddingMetadata(modality, tensor, startedAt) {
  if (tensor?.dims.length !== 2 || tensor.dims[0] !== 1) {
    throw new Error("EmbeddingGemma 2 returned an invalid sentence embedding");
  }
  const values = Array.from(tensor.data, Number);
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("EmbeddingGemma 2 returned an invalid vector");
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.001) {
    throw new Error("EmbeddingGemma 2 returned a non-normalized vector");
  }
  return {
    modality,
    dimensions: values.length,
    norm: Number(norm.toFixed(6)),
    ms: Math.round(performance.now() - startedAt),
  };
}

async function main() {
  const { modality, input } = parseArguments(process.argv.slice(2));
  const startedAt = performance.now();
  env.allowLocalModels = true;

  const source = await modelSource(modality);
  const config = await AutoConfig.from_pretrained(source.id, source.options);
  Object.assign(
    config,
    modality === "audio" ? { vision_config: null } : { audio_config: null },
  );
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(source.id, source.options),
    AutoModel.from_pretrained(source.id, {
      ...source.options,
      config,
      device: "cpu",
      dtype: "q4",
    }),
  ]);

  try {
    const inputs =
      modality === "audio"
        ? await processor(null, null, await loadAudio(input))
        : await processor(null, null, null, await loadVideo(input));
    const output = await model(inputs);
    console.log(
      JSON.stringify(
        embeddingMetadata(modality, output.sentence_embedding, startedAt),
      ),
    );
  } finally {
    await model.dispose();
  }
}

await main();
