import { EMBEDDING_MODEL } from "./on-device-models";

const EMBEDDING_DIMENSIONS = 768 as const;

/** EmbeddingGemma context is 2048 tokens; the ONNX tokenizer's model_max_length is ~1e30, so truncation needs this explicit cap. */
export const EMBEDDING_TOKEN_MAX_LENGTH = 2048;

export const EMBEDDING_TOKENIZER_OPTIONS = {
  padding: true,
  truncation: true,
  max_length: EMBEDDING_TOKEN_MAX_LENGTH,
} as const;

export type EmbeddingTokenizerOptions = typeof EMBEDDING_TOKENIZER_OPTIONS;

export function tokenizeEmbeddingTexts<T>(
  tokenizer: (texts: Array<string>, options: EmbeddingTokenizerOptions) => T,
  texts: Array<string>,
): T {
  return tokenizer(texts, EMBEDDING_TOKENIZER_OPTIONS);
}

const TEXT_PREPROCESSING_VERSION = 4;
const MEDIA_PREPROCESSING_VERSION = 5;
const MEDIA_PREPROCESSING =
  "image-v1+audio-mono16k-30s+video-1fps-32f-32s+normalized-mean-v1+video-batches-16-v1";

function embeddingVersion(
  task: "document" | "media",
  preprocessingVersion: number,
): string {
  return `${EMBEDDING_MODEL.id}@${EMBEDDING_MODEL.revision}:${task}:${EMBEDDING_DIMENSIONS}:${preprocessingVersion}`;
}

export function embeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}

export function textEmbeddingVersion(): string {
  return embeddingVersion("document", TEXT_PREPROCESSING_VERSION);
}

export function mediaEmbeddingVersion(): string {
  return `${embeddingVersion("media", MEDIA_PREPROCESSING_VERSION)}:${MEDIA_PREPROCESSING}`;
}

export function clipEmbeddingVersion(): string {
  return mediaEmbeddingVersion();
}

function cleanEmbeddingText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

export function embeddingSearchQuery(text: string): string {
  return `task: search result | query: ${cleanEmbeddingText(text)}`;
}

export function embeddingDocument(title: string | null, text: string): string {
  const cleanTitle = cleanEmbeddingText(title ?? "") || "none";
  return `title: ${cleanTitle} | text: ${cleanEmbeddingText(text)}`;
}

export function embeddingClassificationLabel(text: string): string {
  return `task: classification | query: ${cleanEmbeddingText(text)}`;
}

export function embeddingSimilarityText(text: string): string {
  return `task: sentence similarity | query: ${cleanEmbeddingText(text)}`;
}

export function embeddingCodeQuery(text: string): string {
  return `task: code retrieval | query: ${cleanEmbeddingText(text)}`;
}

export function embeddingFactClaim(text: string): string {
  return `task: fact checking | query: ${cleanEmbeddingText(text)}`;
}

export function embeddingClusterText(text: string): string {
  return `task: clustering | query: ${cleanEmbeddingText(text)}`;
}

export function normalizedEmbeddingVector(
  vector: ArrayLike<number>,
): Array<number> {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `[embedding-gemma] expected ${EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`,
    );
  }

  let magnitude = 0;
  const values = Array.from(vector, (value) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        "[embedding-gemma] embedding contains a non-finite value",
      );
    }
    magnitude += value * value;
    return value;
  });
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new Error("[embedding-gemma] embedding has zero magnitude");
  }

  const divisor = Math.sqrt(magnitude);
  return values.map((value) => value / divisor);
}
