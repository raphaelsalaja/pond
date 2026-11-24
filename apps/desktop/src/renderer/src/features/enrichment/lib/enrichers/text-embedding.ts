import {
  embedDocument,
  embedModelVersion,
  saveEmbeddingText,
} from "@/features/enrichment/lib/embeddings";
import { setEmbedding } from "@/features/enrichment/state/embedding-store";
import type { Save } from "@/features/saves/types";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import type { Enricher } from "../types";

export const textEmbeddingEnricher: Enricher = {
  id: "textEmbedding",
  dependsOn: ["caption", "ocr", "transcript"],
  enabled: () => getPrefsSnapshot()?.ai?.semanticSearch === true,
  eligible(save: Save) {
    if (save.status !== "complete" || save.deletedAt !== null) {
      return false;
    }
    if (!save.title?.trim() && !saveEmbeddingText(save)) {
      return false;
    }
    return save.embeddingModel !== embedModelVersion();
  },
  async run(save: Save) {
    const text = saveEmbeddingText(save);
    if (!save.title?.trim() && !text) {
      return null;
    }
    const vec = await embedDocument(save.title, text);
    const model = embedModelVersion();
    setEmbedding(save.id, vec, model);
    return { optimistic: { embeddingModel: model } };
  },
};
