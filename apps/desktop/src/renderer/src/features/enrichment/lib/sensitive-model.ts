import type { RawImage } from "@huggingface/transformers";
import { env, InferenceSession, Tensor } from "onnxruntime-web/webgpu";
import { configuredWasmThreads, pickDevice } from "./inference-device";
import {
  SENSITIVE_CONTENT_MODEL_SHA256,
  SENSITIVE_CONTENT_MODEL_URL,
  sensitiveProbabilitiesFromLogits,
} from "./sensitive-content-contract";

const MODEL_CACHE = "pond-models-v1";
const RETIRED_MODEL_URLS = [
  "https://huggingface.co/Marqo/nsfw-image-detection-384/resolve/b2d8f0c3abe6e05062288460ecf58e42ea690e84/onnx/model.onnx",
];
const INPUT_SIZE = 224;
const INFERENCE_BATCH_SIZE = 4;

let sessionPromise: Promise<InferenceSession> | null = null;

function isFloat32Array(value: unknown): value is Float32Array {
  return Object.prototype.toString.call(value) === "[object Float32Array]";
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyModel(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  if ((await sha256(bytes)) !== SENSITIVE_CONTENT_MODEL_SHA256) {
    throw new Error("Sensitive-content model checksum mismatch");
  }
  return bytes;
}

async function fetchModel(): Promise<ArrayBuffer> {
  const request = new Request(SENSITIVE_CONTENT_MODEL_URL, {
    cache: "force-cache",
  });
  let cache: Cache | null = null;
  try {
    cache = (await globalThis.caches?.open(MODEL_CACHE)) ?? null;
  } catch (error) {
    // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
    console.warn("[sensitive-content] model cache unavailable", error);
  }
  for (const url of RETIRED_MODEL_URLS) {
    cache?.delete(url).catch(() => {});
  }
  const cached = await cache?.match(request);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    try {
      return await verifyModel(bytes);
    } catch {
      await cache?.delete(request);
    }
  }

  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(
      `Sensitive-content model download failed (${response.status})`,
    );
  }
  const bytes = await verifyModel(await response.arrayBuffer());
  if (cache) {
    try {
      await cache.put(
        request,
        new Response(bytes.slice(0), {
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    } catch (error) {
      // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
      console.warn("[sensitive-content] model cache write failed", error);
    }
  }
  return bytes;
}

async function createSession(): Promise<InferenceSession> {
  const bytes = await fetchModel();
  env.wasm.numThreads = configuredWasmThreads();
  const device = await pickDevice();
  const executionProviders: Array<InferenceSession.ExecutionProviderConfig> =
    device === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  try {
    return await InferenceSession.create(bytes, { executionProviders });
  } catch (error) {
    if (device !== "webgpu") {
      throw error;
    }
    // oxlint-disable-next-line no-console -- runs in the inference Web Worker, which has no electron-log bridge
    console.warn("[sensitive-content] WebGPU build failed; using WASM", error);
    return InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
  }
}

function getSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = createSession();
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/** The model was trained on whole frames squashed to a square, not center crops. */
async function squash(image: RawImage): Promise<ImageData> {
  const rgba = image.rgba();
  const source = new ImageData(
    new Uint8ClampedArray(rgba.data),
    rgba.width,
    rgba.height,
  );
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Sensitive-content canvas unavailable");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
  bitmap.close();
  return context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
}

async function batchTensor(images: Array<RawImage>): Promise<Tensor> {
  const rows = await Promise.all(
    images.map(async (image) =>
      Tensor.fromImage(await squash(image), {
        dataType: "float32",
        tensorFormat: "RGB",
        tensorLayout: "NCHW",
        norm: { mean: 127.5, bias: -127.5 },
      }),
    ),
  );
  const rowSize = 3 * INPUT_SIZE * INPUT_SIZE;
  const data = new Float32Array(rows.length * rowSize);
  for (const [index, row] of rows.entries()) {
    if (!isFloat32Array(row.data)) {
      throw new Error("Sensitive-content preprocessing returned invalid data");
    }
    data.set(row.data, index * rowSize);
    row.dispose();
  }
  return new Tensor("float32", data, [rows.length, 3, INPUT_SIZE, INPUT_SIZE]);
}

async function classifyBatch(
  session: InferenceSession,
  images: Array<RawImage>,
): Promise<Array<number>> {
  const input = await batchTensor(images);
  try {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) {
      throw new Error("Sensitive-content model has no input or output");
    }
    const outputs = await session.run({ [inputName]: input });
    const output = outputs[outputName];
    if (!output) {
      throw new Error("Sensitive-content model returned no logits");
    }
    try {
      if (!isFloat32Array(output.data)) {
        throw new Error("Sensitive-content model returned invalid logits");
      }
      return sensitiveProbabilitiesFromLogits(output.data);
    } finally {
      output.dispose();
    }
  } finally {
    input.dispose();
  }
}

export async function runSensitiveModel(
  images: Array<RawImage>,
): Promise<Array<number>> {
  if (images.length === 0) {
    return [];
  }
  const session = await getSession();
  const scores: Array<number> = [];
  for (let index = 0; index < images.length; index += INFERENCE_BATCH_SIZE) {
    scores.push(
      ...(await classifyBatch(
        session,
        images.slice(index, index + INFERENCE_BATCH_SIZE),
      )),
    );
  }
  return scores;
}

export async function disposeSensitiveModel(): Promise<void> {
  const current = sessionPromise;
  sessionPromise = null;
  if (current) {
    await (await current).release();
  }
}
