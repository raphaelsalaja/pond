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
  tokenizeEmbeddingTexts,
} from "../../shared/embeddings";
import { EMBEDDING_MODEL } from "../../shared/on-device-models";
import { createIdleResource } from "../lib/idle-resource";
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

interface EmbeddingTextBundle {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
  dispose(): Promise<void>;
}

/** The main process stays resident with the window closed, so the model must not outlive the searches that need it. */
const EMBEDDING_IDLE_MS = 60_000;

/**
 * transformers.js caches downloads beside its own package, which in a packaged
 * build is inside app.asar (read-only, replaced by updates) on every platform,
 * so downloaded models live in user data instead.
 */
export function modelCacheDir(userData: string): string {
  return join(userData, "models");
}

const embeddingText = createIdleResource<EmbeddingTextBundle>({
  load: loadEmbeddingTextBundle,
  idleMs: EMBEDDING_IDLE_MS,
  schedule: (run, ms) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
});

async function loadEmbeddingTextBundle(): Promise<EmbeddingTextBundle> {
  const transformers = await import("@huggingface/transformers");
  transformers.env.allowLocalModels = false;
  transformers.env.cacheDir = modelCacheDir(appDataRoot());
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

  const vector = await embeddingText.use(async ({ model, tokenizer }) => {
    const inputs = tokenizeEmbeddingTexts(
      (batch, options) => tokenizer(batch, options),
      [embeddingQueryText(task, trimmed)],
    );
    return sentenceVector(await model(inputs));
  });
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
  const output = await embeddingText.use(async ({ model, tokenizer }) => {
    const inputs = tokenizeEmbeddingTexts(
      (batch, options) => tokenizer(batch, options),
      texts,
    );
    return model(inputs);
  });
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
