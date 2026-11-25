import { describe, expect, it } from "vitest";
import {
  rankRecommendations,
  relatedSavesWithStore,
} from "./semantic-recommendations";
import type { RelatedSavesStore } from "./semantic-recommendations";

function validVector(): Array<number> {
  const vector = Array.from({ length: 768 }, () => 0);
  vector[0] = 1;
  return vector;
}

describe("rankRecommendations", () => {
  it("ranks nearest compatible Saves first and explains existing organization", () => {
    expect(
      rankRecommendations({
        sourceId: "source",
        semantic: [
          { id: "same-folder", distance: 0.08 },
          { id: "new-topic", distance: 0.12 },
        ],
        alreadyOrganizedIds: new Set(["same-folder"]),
        limit: 5,
      }),
    ).toEqual([
      { id: "same-folder", reason: "already-organized", score: 0.92 },
      { id: "new-topic", reason: "semantically-related", score: 0.88 },
    ]);
  });

  it("excludes the source, deleted Saves, and inadmissible candidates", () => {
    expect(
      rankRecommendations({
        sourceId: "source",
        semantic: [
          { id: "source", distance: 0 },
          { id: "deleted", distance: 0.01, deleted: true },
          { id: "stale-model", distance: 0.02, admissible: false },
          { id: "related", distance: 0.1 },
        ],
        alreadyOrganizedIds: new Set(),
        limit: 12,
      }),
    ).toEqual([{ id: "related", reason: "semantically-related", score: 0.9 }]);
  });

  it("breaks equal-score ties by Save ID and applies the limit", () => {
    expect(
      rankRecommendations({
        sourceId: "source",
        semantic: [
          { id: "zebra", distance: 0.2 },
          { id: "alpha", distance: 0.2 },
          { id: "nearest", distance: 0.1 },
        ],
        alreadyOrganizedIds: new Set(),
        limit: 2,
      }),
    ).toEqual([
      { id: "nearest", reason: "semantically-related", score: 0.9 },
      { id: "alpha", reason: "semantically-related", score: 0.8 },
    ]);
  });
});

describe("relatedSavesWithStore", () => {
  it("uses only the current source vector and compatible candidates", async () => {
    const calls: Array<{ vector: Array<number>; limit: number }> = [];
    const vector = validVector();
    const store: RelatedSavesStore = {
      source: async () => ({
        vector,
        model: "current-model",
        status: "complete",
        deleted: false,
      }),
      neighbors: (vector, limit) => {
        calls.push({ vector, limit });
        return [
          { id: "source", distance: 0 },
          { id: "organized", distance: 0.05 },
          { id: "incompatible", distance: 0.06 },
          { id: "related", distance: 0.1 },
        ];
      },
      admissibleIds: async (_ids, model) => {
        expect(model).toBe("current-model");
        return new Set(["organized", "related"]);
      },
      alreadyOrganizedIds: async () => new Set(["organized"]),
    };

    await expect(
      relatedSavesWithStore(
        store,
        { id: "source", limit: 12 },
        "current-model",
      ),
    ).resolves.toEqual({
      items: [
        { id: "organized", reason: "already-organized", score: 0.95 },
        { id: "related", reason: "semantically-related", score: 0.9 },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.vector).toBe(vector);
    expect(calls[0]?.limit).toBe(200);
  });

  it("does not search from malformed current-model vectors", async () => {
    const nonFinite = validVector();
    nonFinite[1] = Number.NaN;
    const infinite = validVector();
    infinite[1] = Number.POSITIVE_INFINITY;
    const malformed = [
      [],
      Array.from({ length: 767 }, () => 1),
      Array.from({ length: 768 }, () => 0),
      nonFinite,
      infinite,
    ];

    for (const vector of malformed) {
      let searched = false;
      const store: RelatedSavesStore = {
        source: async () => ({
          vector,
          model: "current-model",
          status: "complete",
          deleted: false,
        }),
        neighbors: () => {
          searched = true;
          return [];
        },
        admissibleIds: async () => new Set(),
        alreadyOrganizedIds: async () => new Set(),
      };

      await expect(
        relatedSavesWithStore(
          store,
          { id: "source", limit: 12 },
          "current-model",
        ),
      ).resolves.toEqual({ items: [] });
      expect(searched).toBe(false);
    }
  });

  it("does not search from a missing, deleted, incomplete, or stale source", async () => {
    const sources: Array<Awaited<ReturnType<RelatedSavesStore["source"]>>> = [
      null,
      {
        vector: [1, 0],
        model: "current-model",
        status: "complete",
        deleted: true,
      },
      {
        vector: [1, 0],
        model: "current-model",
        status: "failed",
        deleted: false,
      },
      {
        vector: [1, 0],
        model: "stale-model",
        status: "complete",
        deleted: false,
      },
    ];
    for (const source of sources) {
      let searched = false;
      const store: RelatedSavesStore = {
        source: async () => source,
        neighbors: () => {
          searched = true;
          return [];
        },
        admissibleIds: async () => new Set(),
        alreadyOrganizedIds: async () => new Set(),
      };
      await expect(
        relatedSavesWithStore(
          store,
          { id: "source", limit: 12 },
          "current-model",
        ),
      ).resolves.toEqual({ items: [] });
      expect(searched).toBe(false);
    }
  });
});
