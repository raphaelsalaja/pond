import { join } from "node:path";
import type {
  PreTrainedModel,
  PreTrainedTokenizer,
} from "@huggingface/transformers";
import type { MediaType, Prefs } from "@pond/schema/db";
import {
  embeddingCodeQuery,
  embeddingFactClaim,
  embeddingSearchQuery,
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
  textEmbeddingVersion,
} from "../../shared/embeddings";
import { EMBEDDING_MODEL } from "../../shared/on-device-models";
import { appDataRoot } from "../paths";
import { getPrefs } from "./prefs";

export interface VersionedVector {
  model: string;
  vector: number[];
}

export interface QueryEmbeddings {
  text?: VersionedVector;
  media?: VersionedVector;
}

export const EMBEDDING_QUERY_TASKS = ["search", "code", "fact-check"] as const;
export type EmbeddingQueryTask = (typeof EMBEDDING_QUERY_TASKS)[number];

export function embeddingQueryText(
  task: EmbeddingQueryTask,
  query: string,
): string {
  switch (task) {
    case "code":
      return embeddingCodeQuery(query);
    case "fact-check":
      return embeddingFactClaim(query);
    case "search":
      return embeddingSearchQuery(query);
  }
}

interface Disposable {
  dispose(): void | Promise<void>;
}

interface EmbeddingTextBundle extends Disposable {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

const embeddingCache = new Map<string, Promise<EmbeddingTextBundle>>();
const MODEL_CACHE_LIMIT = 1;

function memo<T extends Disposable>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load();
  cache.set(key, pending);
  pending.catch(() => cache.delete(key));
  if (cache.size > MODEL_CACHE_LIMIT) {
    const oldest = cache.entries().next().value;
    if (oldest && oldest[0] !== key) {
      cache.delete(oldest[0]);
      void oldest[1].then(
        (value) => value.dispose(),
        () => undefined,
      );
    }
  }
  return pending;
}

/**
 * transformers.js caches downloads beside its own package, which on Windows is
 * inside the install directory (read-only in app.asar, wiped by updates), so
 * Windows keeps them in user data. Other platforms keep the library default.
 */
export function modelCacheDir(
  platform: NodeJS.Platform,
  userData: string,
): string | undefined {
  return platform === "win32" ? join(userData, "models") : undefined;
}

async function embeddingTextBundle(): Promise<EmbeddingTextBundle> {
  return memo(embeddingCache, EMBEDDING_MODEL.revision, async () => {
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = false;
    const cacheDir = modelCacheDir(process.platform, appDataRoot());
    if (cacheDir) transformers.env.cacheDir = cacheDir;
    const options = { revision: EMBEDDING_MODEL.revision };
    const config = await transformers.AutoConfig.from_pretrained(
      EMBEDDING_MODEL.id,
      options,
    );
    Object.assign(config, { audio_config: null, vision_config: null });
    const [tokenizer, model] = await Promise.all([
      transformers.AutoTokenizer.from_pretrained(EMBEDDING_MODEL.id, options),
      transformers.AutoModel.from_pretrained(EMBEDDING_MODEL.id, {
        ...options,
        config,
        device: "cpu",
        dtype: "q4",
      }),
    ]);
    return {
      tokenizer,
      model,
      dispose: async () => {
        await model.dispose();
      },
    };
  });
}

function sentenceVector(output: {
  sentence_embedding?: { data?: ArrayLike<number> };
}): number[] {
  const data = output.sentence_embedding?.data;
  if (!data) {
    throw new Error("[embedding-gemma] model returned no sentence embedding");
  }
  return normalizedEmbeddingVector(data);
}

export function cosineSimilarity(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number | null {
  if (!left.length || left.length !== right.length) return null;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  if (!leftMagnitude || !rightMagnitude) return null;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    for (const [index, id] of [...new Set(list)].entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    }
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    );
}

interface QueryEmbeddingChannels {
  text: boolean;
  media: boolean;
}

export function queryEmbeddingChannels(
  media: MediaType[],
  prefs: Pick<Prefs["ai"], "semanticSearch" | "enableClip">,
): QueryEmbeddingChannels {
  const hasMediaScope =
    !media.length ||
    media.some(
      (type) => type === "image" || type === "audio" || type === "video",
    );
  return {
    text: prefs.semanticSearch === true,
    media: prefs.enableClip === true && hasMediaScope,
  };
}

export async function encodeQueryEmbeddings(
  query: string,
  media: MediaType[],
  prefs?: Pick<Prefs, "ai">,
  task: EmbeddingQueryTask = "search",
): Promise<QueryEmbeddings> {
  const trimmed = query.trim();
  if (!trimmed) return {};
  const resolvedPrefs = prefs ?? (await getPrefs());
  const channels = queryEmbeddingChannels(media, resolvedPrefs.ai);
  if (!channels.text && !channels.media) return {};

  const { model, tokenizer } = await embeddingTextBundle();
  const inputs = tokenizer([embeddingQueryText(task, trimmed)], {
    padding: true,
    truncation: true,
  });
  const vector = sentenceVector(await model(inputs));
  const result: QueryEmbeddings = {};
  if (channels.text) {
    result.text = { model: textEmbeddingVersion(), vector };
  }
  if (channels.media) {
    result.media = { model: mediaEmbeddingVersion(), vector };
  }
  return result;
}

export async function encodeClassificationLabelEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { model, tokenizer } = await embeddingTextBundle();
  const inputs = tokenizer(texts, {
    padding: true,
    truncation: true,
  });
  const output = await model(inputs);
  const tensor = output.sentence_embedding;
  if (tensor?.dims.length !== 2 || tensor.dims[0] !== texts.length) {
    throw new Error(
      "[embedding-gemma] model returned invalid label embeddings",
    );
  }
  const width = tensor.dims[1] ?? 0;
  return Array.from({ length: texts.length }, (_, index) =>
    normalizedEmbeddingVector(
      tensor.data.slice(index * width, (index + 1) * width),
    ),
  );
}
