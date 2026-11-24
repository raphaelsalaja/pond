import {
  embeddingDocument,
  embeddingSearchQuery,
  textEmbeddingVersion,
} from "@shared/embeddings";
import {
  inferEmbedText,
  inferEmbedTexts,
} from "@/features/enrichment/lib/inference-client";

export function embedModelVersion(): string {
  return textEmbeddingVersion();
}

export function embedDocument(
  title: string | null,
  text: string,
): Promise<Float32Array> {
  return inferEmbedText(embeddingDocument(title, text));
}

export function embedSearchQueries(
  texts: Array<string>,
): Promise<Array<Float32Array>> {
  return inferEmbedTexts(texts.map(embeddingSearchQuery));
}

export const SAVE_EMBEDDING_CHAR_LIMIT = 2000;

export function saveEmbeddingBody(save: {
  description: string | null;
  notes: string | null;
  author: string | null;
  tags: Array<string>;
}): string {
  return [
    save.description ?? "",
    save.notes ?? "",
    save.author ?? "",
    (save.tags ?? []).join(" "),
  ]
    .filter((s) => s.trim().length > 0)
    .join(" \u2014 ")
    .slice(0, SAVE_EMBEDDING_CHAR_LIMIT);
}

export function saveEmbeddingText(save: {
  description: string | null;
  notes: string | null;
  author: string | null;
  tags: Array<string>;
  caption?: string | null;
  ocrText?: string | null;
  transcript?: string | null;
}): string {
  const extra = [save.caption, save.ocrText, save.transcript]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(" \u2014 ")
    .slice(0, SAVE_EMBEDDING_CHAR_LIMIT);
  return [saveEmbeddingBody(save), extra]
    .filter((s) => s.trim().length > 0)
    .join(" \u2014 ");
}
