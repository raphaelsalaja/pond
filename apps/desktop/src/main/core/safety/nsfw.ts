import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NsfwLabel } from "@pond/schema/db";
import { app } from "electron";
import log from "electron-log/main.js";
import { itemFile } from "../../paths";

export interface NsfwResult {
  score: number;
  label: NsfwLabel;
}

const NSFWJS_CLASS_NAMES: Record<string, NsfwLabel> = {
  Drawing: "drawing",
  Hentai: "hentai",
  Neutral: "neutral",
  Porn: "porn",
  Sexy: "sexy",
};

const BLOCK_LABELS = new Set<NsfwLabel>(["porn", "hentai", "sexy"]);

let modelPromise: Promise<NsfwModel | null> | null = null;

interface NsfwModel {
  classify(
    input: unknown,
  ): Promise<Array<{ className: string; probability: number }>>;
}

interface TfModule {
  tensor3d(
    values: Uint8Array | Int32Array | Float32Array | number[],
    shape: [number, number, number],
    dtype?: "int32" | "float32",
  ): { dispose(): void };
}

let tfModule: TfModule | null = null;

function resolveModelDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "nsfw-model");
  }
  return join(app.getAppPath(), "resources", "nsfw-model");
}

async function loadModelFromDisk(
  dir: string,
  _tf: typeof import("@tensorflow/tfjs"),
  nsfw: typeof import("nsfwjs"),
): Promise<NsfwModel | null> {
  const modelJsonPath = join(dir, "model.json");
  if (!existsSync(modelJsonPath)) return null;
  let modelJson: {
    modelTopology: unknown;
    weightsManifest: Array<{ paths: string[]; weights: unknown[] }>;
  };
  try {
    modelJson = JSON.parse(await readFile(modelJsonPath, "utf-8"));
  } catch (err) {
    log.warn("[pond safety] failed to parse model.json", err);
    return null;
  }
  const weightSpecs = modelJson.weightsManifest.flatMap(
    (m) => m.weights as never[],
  );
  const buffers = await Promise.all(
    modelJson.weightsManifest.flatMap((m) =>
      m.paths.map((p) => readFile(join(dir, p))),
    ),
  );
  const merged = Buffer.concat(buffers);
  const weightData = merged.buffer.slice(
    merged.byteOffset,
    merged.byteOffset + merged.byteLength,
  );
  const handler: import("@tensorflow/tfjs").io.IOHandler = {
    load: async () => ({
      modelTopology: modelJson.modelTopology as never,
      weightSpecs: weightSpecs as never,
      weightData,
    }),
  };
  return (await nsfw.load(handler as never)) as unknown as NsfwModel;
}

async function loadModel(): Promise<NsfwModel | null> {
  let tf: typeof import("@tensorflow/tfjs");
  let nsfw: typeof import("nsfwjs");
  try {
    tf = await import("@tensorflow/tfjs");
    nsfw = await import("nsfwjs");
  } catch (err) {
    log.warn("[pond safety] tfjs / nsfwjs not installed", err);
    return null;
  }
  tfModule = tf as unknown as TfModule;

  const dir = resolveModelDir();
  try {
    const disk = await loadModelFromDisk(dir, tf, nsfw);
    if (disk) {
      log.info("[pond safety] nsfw model loaded from", dir);
      return disk;
    }
  } catch (err) {
    log.warn("[pond safety] disk model load failed; falling back to CDN", err);
  }

  try {
    const model = (await nsfw.load()) as unknown as NsfwModel;
    log.info("[pond safety] nsfw model loaded from default URL");
    return model;
  } catch (err) {
    log.warn("[pond safety] default model load failed", err);
    return null;
  }
}

function getModel(): Promise<NsfwModel | null> {
  if (!modelPromise) {
    modelPromise = loadModel().catch((err) => {
      log.warn("[pond safety] model load rejected", err);
      modelPromise = null;
      return null;
    });
  }
  return modelPromise;
}

function bitmapToRgbTensor(
  bitmap: Buffer,
  width: number,
  height: number,
  tf: TfModule,
): { dispose(): void } {
  const isBgra = process.platform === "darwin" || process.platform === "win32";
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i + 3 < bitmap.length; i += 4, j += 3) {
    if (isBgra) {
      rgb[j] = bitmap[i + 2] ?? 0;
      rgb[j + 1] = bitmap[i + 1] ?? 0;
      rgb[j + 2] = bitmap[i] ?? 0;
    } else {
      rgb[j] = bitmap[i] ?? 0;
      rgb[j + 1] = bitmap[i + 1] ?? 0;
      rgb[j + 2] = bitmap[i + 2] ?? 0;
    }
  }
  return tf.tensor3d(rgb, [height, width, 3], "int32");
}

export async function classifyImage(
  absPath: string,
): Promise<NsfwResult | null> {
  if (!existsSync(absPath)) return null;
  const model = await getModel();
  if (!model || !tfModule) return null;

  let buf: Buffer;
  try {
    buf = await readFile(absPath);
  } catch (err) {
    log.warn("[pond safety] could not read cover", absPath, err);
    return null;
  }

  const { nativeImage } = await import("electron");
  const decoded = nativeImage.createFromBuffer(buf);
  if (decoded.isEmpty()) return null;
  const resized = decoded.resize({ width: 224, height: 224, quality: "good" });
  const bitmap = resized.toBitmap();
  if (bitmap.length === 0) return null;

  const tensor = bitmapToRgbTensor(bitmap, 224, 224, tfModule);
  try {
    const predictions = await model.classify(tensor);
    return summarise(predictions);
  } catch (err) {
    log.warn("[pond safety] classify failed", absPath, err);
    return null;
  } finally {
    tensor.dispose();
  }
}

export async function classifySave(args: {
  id: string;
  files: Array<{ path: string }>;
}): Promise<NsfwResult | null> {
  const cover = pickCoverFile(args.files);
  if (!cover) return null;
  return classifyImage(itemFile(args.id, cover));
}

function pickCoverFile(files: Array<{ path: string }>): string | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  const visual = files.find((f) => {
    if (typeof f.path !== "string") return false;
    const lower = f.path.toLowerCase();
    return (
      !lower.endsWith(".mp4") &&
      !lower.endsWith(".webm") &&
      !lower.endsWith(".mov") &&
      !lower.endsWith(".m4v")
    );
  });
  return visual?.path ?? null;
}

function summarise(
  predictions: Array<{ className: string; probability: number }>,
): NsfwResult {
  let topLabel: NsfwLabel = "neutral";
  let topProb = -1;
  let blockProb = 0;
  for (const p of predictions) {
    const label = NSFWJS_CLASS_NAMES[p.className];
    if (!label) continue;
    if (p.probability > topProb) {
      topProb = p.probability;
      topLabel = label;
    }
    if (BLOCK_LABELS.has(label) && p.probability > blockProb) {
      blockProb = p.probability;
    }
  }
  return { score: blockProb, label: topLabel };
}
