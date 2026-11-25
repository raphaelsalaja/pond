import { saveFolders, saves } from "@pond/schema/db";
import type { SaveStatus } from "@pond/schema/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
} from "../../shared/embeddings";
import type { Db } from "../db";
import { knnVec, parseJsonVector } from "./vec-index";

export type RecommendationReason = "semantically-related" | "already-organized";

export interface SemanticRecommendationCandidate {
  id: string;
  distance: number;
  deleted?: boolean;
  admissible?: boolean;
}

export interface RankedRecommendation {
  id: string;
  score: number;
  reason: RecommendationReason;
}

export function rankRecommendations(input: {
  sourceId: string;
  semantic: Array<SemanticRecommendationCandidate>;
  alreadyOrganizedIds: ReadonlySet<string>;
  limit: number;
}): Array<RankedRecommendation> {
  const limit = Math.max(0, Math.floor(input.limit));
  return input.semantic
    .filter(
      (candidate) =>
        candidate.id !== input.sourceId &&
        candidate.deleted !== true &&
        candidate.admissible !== false &&
        Number.isFinite(candidate.distance),
    )
    .map<RankedRecommendation>((candidate) => ({
      id: candidate.id,
      score: 1 - candidate.distance,
      reason: input.alreadyOrganizedIds.has(candidate.id)
        ? "already-organized"
        : "semantically-related",
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    .slice(0, limit);
}

const MAX_RELATED_SAVES = 100;

interface RecommendationSource {
  vector: Array<number>;
  model: string;
  status: SaveStatus;
  deleted: boolean;
}

export interface RelatedSavesStore {
  source(id: string): Promise<RecommendationSource | null>;
  neighbors(
    vector: Array<number>,
    limit: number,
  ): Array<{ id: string; distance: number }>;
  admissibleIds(
    ids: Array<string>,
    model: string,
  ): Promise<ReadonlySet<string>>;
  alreadyOrganizedIds(
    sourceId: string,
    candidateIds: Array<string>,
  ): Promise<ReadonlySet<string>>;
}

function isAdmissibleSourceVector(vector: Array<number>): boolean {
  try {
    normalizedEmbeddingVector(vector);
    return true;
  } catch {
    return false;
  }
}

export async function relatedSavesWithStore(
  store: RelatedSavesStore,
  input: { id: string; limit?: number },
  currentModel = mediaEmbeddingVersion(),
): Promise<{ items: Array<RankedRecommendation> }> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? 12)),
    MAX_RELATED_SAVES,
  );
  const source = await store.source(input.id);
  if (
    !source ||
    source.deleted ||
    source.status !== "complete" ||
    source.model !== currentModel ||
    !isAdmissibleSourceVector(source.vector)
  ) {
    return { items: [] };
  }

  const neighbors = store
    .neighbors(source.vector, Math.max(limit * 8, 200))
    .filter((candidate) => candidate.id !== input.id);
  if (!neighbors.length) return { items: [] };
  const candidateIds = neighbors.map((candidate) => candidate.id);
  const [admissibleIds, alreadyOrganizedIds] = await Promise.all([
    store.admissibleIds(candidateIds, source.model),
    store.alreadyOrganizedIds(input.id, candidateIds),
  ]);

  return {
    items: rankRecommendations({
      sourceId: input.id,
      semantic: neighbors.map((candidate) => ({
        ...candidate,
        admissible: admissibleIds.has(candidate.id),
      })),
      alreadyOrganizedIds,
      limit,
    }),
  };
}

function relatedSavesStore(db: Db): RelatedSavesStore {
  return {
    async source(id) {
      const [source] = await db
        .select({
          clipEmbedding: saves.clipEmbedding,
          clipModel: saves.clipModel,
          deletedAt: saves.deletedAt,
          status: saves.status,
        })
        .from(saves)
        .where(eq(saves.id, id))
        .limit(1);
      const vector = parseJsonVector(source?.clipEmbedding);
      if (!source?.clipModel || !vector) return null;
      return {
        vector,
        model: source.clipModel,
        status: source.status,
        deleted: source.deletedAt !== null,
      };
    },
    neighbors(vector, limit) {
      return knnVec(db.$raw, "clip", vector, limit);
    },
    async admissibleIds(ids, model) {
      if (!ids.length) return new Set();
      const rows = await db
        .select({ id: saves.id })
        .from(saves)
        .where(
          and(
            inArray(saves.id, ids),
            isNull(saves.deletedAt),
            eq(saves.status, "complete"),
            eq(saves.clipModel, model),
          ),
        );
      return new Set(rows.map((row) => row.id));
    },
    async alreadyOrganizedIds(sourceId, candidateIds) {
      if (!candidateIds.length) return new Set();
      const sourceFolders = await db
        .select({ folderId: saveFolders.folderId })
        .from(saveFolders)
        .where(eq(saveFolders.saveId, sourceId));
      if (!sourceFolders.length) return new Set();
      const rows = await db
        .selectDistinct({ id: saveFolders.saveId })
        .from(saveFolders)
        .where(
          and(
            inArray(
              saveFolders.folderId,
              sourceFolders.map((row) => row.folderId),
            ),
            inArray(saveFolders.saveId, candidateIds),
          ),
        );
      return new Set(rows.map((row) => row.id));
    },
  };
}

export async function relatedSaves(
  db: Db,
  input: { id: string; limit?: number },
): Promise<{ items: Array<RankedRecommendation> }> {
  return relatedSavesWithStore(relatedSavesStore(db), input);
}
