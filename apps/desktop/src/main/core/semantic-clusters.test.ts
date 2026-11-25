import { describe, expect, it } from "vitest";
import { normalizedEmbeddingVector } from "../../shared/embeddings";
import { savesReadQueries } from "../ipc/queries/saves-read";
import {
  previewSemanticClusters,
  semanticClustersWithStore,
} from "./semantic-clusters";
import type {
  SemanticClusterCandidate,
  SemanticClusterEdge,
  SemanticClusterSourceCandidate,
  SemanticClustersStore,
} from "./semantic-clusters";

function vector(first: number, second: number): Array<number> {
  return normalizedEmbeddingVector([
    first,
    second,
    ...Array.from({ length: 766 }, () => 0),
  ]);
}

const candidates: Array<SemanticClusterCandidate> = [
  {
    id: "a1",
    title: "Design systems",
    tags: ["Design"],
    vector: vector(1, 0),
  },
  {
    id: "a2",
    title: "Design systems",
    tags: ["Design"],
    vector: vector(0.995, 0.1),
  },
  {
    id: "a3",
    title: "Design systems",
    tags: ["Design"],
    vector: vector(0.995, -0.1),
  },
  {
    id: "a4",
    title: "Design systems",
    tags: [],
    vector: vector(0.98, 0.2),
  },
  {
    id: "b1",
    title: "Recipes",
    tags: ["Cooking"],
    vector: vector(0, 1),
  },
  {
    id: "b2",
    title: "Recipes",
    tags: ["Cooking"],
    vector: vector(0.1, 0.995),
  },
  {
    id: "b3",
    title: "Recipes",
    tags: [],
    vector: vector(-0.1, 0.995),
  },
  { id: "u1", title: "One", tags: [], vector: vector(-1, 0) },
  { id: "u2", title: "Two", tags: [], vector: vector(-0.995, 0.1) },
  { id: "u3", title: "Three", tags: [], vector: vector(-0.5, 0.866) },
  { id: "u4", title: "Four", tags: [], vector: vector(-0.5, -0.866) },
  { id: "u5", title: "Five", tags: [], vector: vector(0.5, -0.866) },
];

const edges: Array<SemanticClusterEdge> = [
  { sourceId: "a1", targetId: "a2" },
  { sourceId: "a2", targetId: "a3" },
  { sourceId: "a1", targetId: "a4" },
  { sourceId: "b1", targetId: "b2" },
  { sourceId: "b1", targetId: "b3" },
  { sourceId: "u1", targetId: "u2" },
];

function candidate(id: string): SemanticClusterCandidate {
  const found = candidates.find((value) => value.id === id);
  if (!found) throw new Error(`missing test candidate: ${id}`);
  return found;
}

describe("previewSemanticClusters", () => {
  it("returns stable cluster membership, labels, and explicit unclustered Saves", () => {
    const expected = {
      clusters: [
        {
          id: "a1",
          labels: ["Design systems", "Design"],
          memberIds: ["a1", "a2", "a3", "a4"],
        },
        {
          id: "b1",
          labels: ["Recipes", "Cooking"],
          memberIds: ["b1", "b2", "b3"],
        },
      ],
      unclustered: ["u1", "u2", "u3", "u4", "u5"],
    };

    expect(
      previewSemanticClusters({ candidates, edges, distance: 0.03 }),
    ).toEqual(expected);
    expect(
      previewSemanticClusters({
        candidates: [...candidates].reverse(),
        edges: [...edges].reverse().map(({ sourceId, targetId }) => ({
          sourceId: targetId,
          targetId: sourceId,
        })),
        distance: 0.03,
      }),
    ).toEqual(expected);
  });
});

describe("semanticClustersWithStore", () => {
  it("uses bounded neighbors for only current, complete, admissible Saves", async () => {
    const currentModel = "current-media-model";
    const rows: Array<SemanticClusterSourceCandidate> = [
      ...candidates.slice(0, 3).map((candidate) => ({
        ...candidate,
        model: currentModel,
        status: "complete" as const,
        deleted: false,
      })),
      {
        ...candidate("a4"),
        model: "stale-model",
        status: "complete",
        deleted: false,
      },
      {
        ...candidate("b1"),
        model: currentModel,
        status: "complete",
        deleted: true,
      },
      {
        ...candidate("b2"),
        model: currentModel,
        status: "failed",
        deleted: false,
      },
      {
        id: "malformed",
        title: null,
        tags: [],
        vector: [1, 0],
        model: currentModel,
        status: "complete",
        deleted: false,
      },
      {
        id: "non-finite",
        title: null,
        tags: [],
        vector: [Number.NaN, ...Array.from({ length: 767 }, () => 0)],
        model: currentModel,
        status: "complete",
        deleted: false,
      },
    ];
    const candidateCalls: Array<number> = [];
    const neighborCalls: Array<number> = [];
    const store: SemanticClustersStore = {
      candidates: async (_scope, model, limit) => {
        expect(model).toBe(currentModel);
        candidateCalls.push(limit);
        return [...rows].reverse();
      },
      neighbors: (_vector, limit) => {
        neighborCalls.push(limit);
        return rows.map(({ id }, index) => ({ id, distance: index / 100 }));
      },
    };

    await expect(
      semanticClustersWithStore(
        store,
        { distance: 0.03, limit: 4000 },
        currentModel,
      ),
    ).resolves.toEqual({
      clusters: [
        {
          id: "a1",
          labels: ["Design", "Design systems"],
          memberIds: ["a1", "a2", "a3"],
        },
      ],
      unclustered: [],
    });
    expect(candidateCalls).toEqual([2000]);
    expect(neighborCalls).toHaveLength(3);
    expect(neighborCalls.every((limit) => limit <= 25)).toBe(true);
  });
});

describe("saves.semanticClusters input", () => {
  it("bounds preview scope, distance, and candidate count", () => {
    const schema = savesReadQueries["saves.semanticClusters"].inputSchema;

    expect(schema.safeParse({ distance: 0.2, limit: 2000 }).success).toBe(true);
    expect(
      schema.safeParse({
        saveIds: Array.from({ length: 2001 }, (_, index) => `save-${index}`),
        distance: 0.2,
        limit: 100,
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ distance: -0.01, limit: 100 }).success).toBe(
      false,
    );
    expect(schema.safeParse({ distance: 2.01, limit: 100 }).success).toBe(
      false,
    );
    expect(schema.safeParse({ distance: 0.2, limit: 2 }).success).toBe(false);
    expect(schema.safeParse({ distance: 0.2, limit: 2001 }).success).toBe(
      false,
    );
  });
});
