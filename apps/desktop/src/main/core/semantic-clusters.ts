import { saveFolders, saves } from "@pond/schema/db";
import type { SaveStatus } from "@pond/schema/db";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
} from "../../shared/embeddings";
import type { Db } from "../db";
import { knnVec, parseJsonVector } from "./vec-index";

export interface SemanticClusterCandidate {
  id: string;
  title: string | null;
  tags: Array<string>;
  vector: Array<number>;
}

export interface SemanticClusterEdge {
  sourceId: string;
  targetId: string;
}

export interface SemanticClusterPreview {
  clusters: Array<{
    id: string;
    labels: Array<string>;
    memberIds: Array<string>;
  }>;
  unclustered: Array<string>;
}

export interface SemanticClusterSourceCandidate extends SemanticClusterCandidate {
  model: string;
  status: SaveStatus;
  deleted: boolean;
}

export interface SemanticClusterScope {
  saveIds?: Array<string>;
  folderId?: string;
}

export interface SemanticClustersStore {
  candidates(
    scope: SemanticClusterScope,
    model: string,
    limit: number,
  ): Promise<Array<SemanticClusterSourceCandidate>>;
  neighbors(
    vector: Array<number>,
    limit: number,
  ): Array<{ id: string; distance: number }>;
}

const MIN_CLUSTER_SIZE = 3;
const MAX_CLUSTER_LABELS = 3;
const MAX_CLUSTER_CANDIDATES = 2000;
const MAX_NEIGHBORS_PER_SAVE = 24;

function cosineDistance(left: Array<number>, right: Array<number>): number {
  if (left.length !== right.length || left.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return 1 - Math.min(1, Math.max(-1, dot));
}

function clusterLabels(
  candidates: Array<SemanticClusterCandidate>,
): Array<string> {
  const counts = new Map<string, { count: number; label: string }>();
  for (const candidate of candidates) {
    const labels = [candidate.title, ...candidate.tags].flatMap((raw) => {
      const label = raw?.replaceAll(/\s+/g, " ").trim();
      return label ? [label] : [];
    });
    const seen = new Set<string>();
    for (const label of labels) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      if (!current) {
        counts.set(key, { count: 1, label });
        continue;
      }
      current.count += 1;
      if (label < current.label) current.label = label;
    }
  }
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.label < right.label ? -1 : left.label > right.label ? 1 : 0),
    )
    .slice(0, MAX_CLUSTER_LABELS)
    .map(({ label }) => label);
}

export function previewSemanticClusters(input: {
  candidates: Array<SemanticClusterCandidate>;
  edges: Array<SemanticClusterEdge>;
  distance: number;
}): SemanticClusterPreview {
  const candidates = [...input.candidates].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const parent = new Map(
    candidates.map((candidate) => [candidate.id, candidate.id]),
  );

  function root(id: string): string {
    const next = parent.get(id);
    if (!next || next === id) return id;
    const resolved = root(next);
    parent.set(id, resolved);
    return resolved;
  }

  function union(leftId: string, rightId: string): void {
    const leftRoot = root(leftId);
    const rightRoot = root(rightId);
    if (leftRoot === rightRoot) return;
    const [first, second] =
      leftRoot < rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot];
    parent.set(second, first);
  }

  for (const edge of input.edges) {
    const source = byId.get(edge.sourceId);
    const target = byId.get(edge.targetId);
    if (!source || !target || source.id === target.id) continue;
    if (cosineDistance(source.vector, target.vector) <= input.distance) {
      union(source.id, target.id);
    }
  }

  const components = new Map<string, Array<SemanticClusterCandidate>>();
  for (const candidate of candidates) {
    const id = root(candidate.id);
    const current = components.get(id);
    if (current) current.push(candidate);
    else components.set(id, [candidate]);
  }

  const clusters: SemanticClusterPreview["clusters"] = [];
  const unclustered: Array<string> = [];
  for (const component of components.values()) {
    const memberIds = component.map((candidate) => candidate.id).sort();
    if (memberIds.length < MIN_CLUSTER_SIZE) {
      unclustered.push(...memberIds);
      continue;
    }
    const id = memberIds[0];
    if (!id) continue;
    clusters.push({
      id,
      labels: clusterLabels(component),
      memberIds,
    });
  }

  clusters.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  unclustered.sort();
  return { clusters, unclustered };
}

function eligibleCandidates(
  rows: Array<SemanticClusterSourceCandidate>,
  model: string,
  limit: number,
): Array<SemanticClusterCandidate> {
  const eligible = new Map<string, SemanticClusterCandidate>();
  for (const row of [...rows].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )) {
    if (
      eligible.has(row.id) ||
      row.deleted ||
      row.status !== "complete" ||
      row.model !== model
    ) {
      continue;
    }
    try {
      eligible.set(row.id, {
        id: row.id,
        title: row.title,
        tags: row.tags,
        vector: normalizedEmbeddingVector(row.vector),
      });
    } catch {
      /** Malformed stored vectors are not admissible cluster inputs. */
    }
  }
  return [...eligible.values()].slice(0, limit);
}

export async function semanticClustersWithStore(
  store: SemanticClustersStore,
  input: SemanticClusterScope & { distance: number; limit: number },
  currentModel = mediaEmbeddingVersion(),
): Promise<SemanticClusterPreview> {
  const limit = Math.min(
    Math.max(MIN_CLUSTER_SIZE, Math.floor(input.limit)),
    MAX_CLUSTER_CANDIDATES,
  );
  const candidates = eligibleCandidates(
    await store.candidates(
      { saveIds: input.saveIds, folderId: input.folderId },
      currentModel,
      limit,
    ),
    currentModel,
    limit,
  );
  if (candidates.length < MIN_CLUSTER_SIZE) {
    return {
      clusters: [],
      unclustered: candidates.map(({ id }) => id),
    };
  }

  const candidateIds = new Set(candidates.map(({ id }) => id));
  const edges: Array<SemanticClusterEdge> = [];
  const neighborLimit = Math.min(MAX_NEIGHBORS_PER_SAVE + 1, candidates.length);
  for (const candidate of candidates) {
    const neighbors = store
      .neighbors(candidate.vector, neighborLimit)
      .filter(
        (neighbor) =>
          neighbor.id !== candidate.id &&
          candidateIds.has(neighbor.id) &&
          Number.isFinite(neighbor.distance),
      )
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )
      .slice(0, MAX_NEIGHBORS_PER_SAVE);
    edges.push(
      ...neighbors.map(({ id }) => ({
        sourceId: candidate.id,
        targetId: id,
      })),
    );
  }

  return previewSemanticClusters({
    candidates,
    edges,
    distance: input.distance,
  });
}

function semanticClustersStore(db: Db): SemanticClustersStore {
  return {
    async candidates(scope, model, limit) {
      if (scope.saveIds && scope.saveIds.length === 0) return [];
      const rows = await db
        .select({
          id: saves.id,
          title: saves.title,
          tags: saves.tags,
          clipEmbedding: saves.clipEmbedding,
          clipModel: saves.clipModel,
          status: saves.status,
          deletedAt: saves.deletedAt,
        })
        .from(saves)
        .where(
          and(
            isNull(saves.deletedAt),
            eq(saves.status, "complete"),
            eq(saves.clipModel, model),
            isNotNull(saves.clipEmbedding),
            scope.saveIds ? inArray(saves.id, scope.saveIds) : undefined,
            scope.folderId
              ? sql`exists (
                  select 1 from ${saveFolders}
                  where ${saveFolders.saveId} = ${saves.id}
                    and ${saveFolders.folderId} = ${scope.folderId}
                )`
              : undefined,
          ),
        )
        .orderBy(asc(saves.id))
        .limit(limit);

      return rows.flatMap((row) => {
        const vector = parseJsonVector(row.clipEmbedding);
        if (!vector || !row.clipModel) return [];
        return [
          {
            id: row.id,
            title: row.title,
            tags: row.tags,
            vector,
            model: row.clipModel,
            status: row.status,
            deleted: row.deletedAt !== null,
          },
        ];
      });
    },
    neighbors(vector, limit) {
      return knnVec(db.$raw, "clip", vector, limit);
    },
  };
}

export async function semanticClusters(
  db: Db,
  input: SemanticClusterScope & { distance: number; limit: number },
): Promise<SemanticClusterPreview> {
  return semanticClustersWithStore(semanticClustersStore(db), input);
}
