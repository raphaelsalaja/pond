import { saves } from "@pond/schema/db";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  embeddingClassificationLabel,
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
} from "../../shared/embeddings";
import type { Db } from "../db";
import {
  cosineSimilarity,
  encodeClassificationLabelEmbeddings,
} from "./query-embeddings";
import { parseJsonVector } from "./vec-index";

interface ClassificationCandidate {
  id: string;
  vector: Array<number>;
}

export interface SemanticClassificationStore {
  candidates(
    ids: Array<string>,
    model: string,
  ): Promise<Array<ClassificationCandidate>>;
}

export interface SemanticClassificationPreview {
  items: Array<{
    id: string;
    scores: Array<{ label: string; score: number }>;
  }>;
  excludedIds: Array<string>;
}

type EmbedLabels = (texts: Array<string>) => Promise<Array<Array<number>>>;

function cleanLabels(labels: Array<string>): Array<string> {
  const seen = new Set<string>();
  const cleaned: Array<string> = [];
  for (const label of labels) {
    const value = label.replaceAll(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }
  return cleaned;
}

export async function classifyLabelsWithStore(
  store: SemanticClassificationStore,
  input: { saveIds: Array<string>; labels: Array<string> },
  embedLabels: EmbedLabels,
  currentModel = mediaEmbeddingVersion(),
): Promise<SemanticClassificationPreview> {
  const saveIds = [...new Set(input.saveIds)].sort();
  const labels = cleanLabels(input.labels);
  if (saveIds.length === 0 || labels.length === 0) {
    return { items: [], excludedIds: saveIds };
  }

  const [rows, labelVectors] = await Promise.all([
    store.candidates(saveIds, currentModel),
    embedLabels(labels.map(embeddingClassificationLabel)),
  ]);
  if (labelVectors.length !== labels.length) {
    throw new Error(
      "Label embedding count did not match the requested labels.",
    );
  }

  const candidates = new Map<string, Array<number>>();
  for (const row of rows) {
    if (!saveIds.includes(row.id) || candidates.has(row.id)) continue;
    try {
      candidates.set(row.id, normalizedEmbeddingVector(row.vector));
    } catch {
      /** Malformed stored vectors stay out of a preview. */
    }
  }

  return {
    items: [...candidates]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, vector]) => ({
        id,
        scores: labels
          .flatMap((label, index) => {
            const labelVector = labelVectors[index];
            if (!labelVector) return [];
            const score = cosineSimilarity(vector, labelVector);
            return score === null ? [] : [{ label, score }];
          })
          .sort(
            (left, right) =>
              right.score - left.score || left.label.localeCompare(right.label),
          ),
      })),
    excludedIds: saveIds.filter((id) => !candidates.has(id)),
  };
}

function classificationStore(db: Db): SemanticClassificationStore {
  return {
    async candidates(ids, model) {
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          id: saves.id,
          vector: saves.clipEmbedding,
        })
        .from(saves)
        .where(
          and(
            inArray(saves.id, ids),
            isNull(saves.deletedAt),
            eq(saves.status, "complete"),
            eq(saves.clipModel, model),
            isNotNull(saves.clipEmbedding),
          ),
        )
        .orderBy(asc(saves.id));
      return rows.flatMap((row) => {
        const vector = parseJsonVector(row.vector);
        return vector ? [{ id: row.id, vector }] : [];
      });
    },
  };
}

export async function classifyLabels(
  db: Db,
  input: { saveIds: Array<string>; labels: Array<string> },
): Promise<SemanticClassificationPreview> {
  return classifyLabelsWithStore(
    classificationStore(db),
    input,
    encodeClassificationLabelEmbeddings,
  );
}
