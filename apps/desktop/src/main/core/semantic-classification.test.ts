import { describe, expect, it } from "vitest";
import { normalizedEmbeddingVector } from "../../shared/embeddings";
import { savesReadQueries } from "../ipc/queries/saves-read";
import { classifyLabelsWithStore } from "./semantic-classification";
import type { SemanticClassificationStore } from "./semantic-classification";

function vector(first: number, second: number): Array<number> {
  return normalizedEmbeddingVector([
    first,
    second,
    ...Array.from({ length: 766 }, () => 0),
  ]);
}

describe("classifyLabelsWithStore", () => {
  it("scores user labels against current media vectors deterministically", async () => {
    const candidateModels: Array<string> = [];
    const embedded: Array<Array<string>> = [];
    const store: SemanticClassificationStore = {
      candidates: async (_ids, model) => {
        candidateModels.push(model);
        return [
          { id: "save-b", vector: vector(0, 1) },
          { id: "save-a", vector: vector(1, 0) },
        ];
      },
    };
    const embed = async (texts: Array<string>) => {
      embedded.push(texts);
      return [vector(1, 0), vector(0, 1)];
    };

    await expect(
      classifyLabelsWithStore(
        store,
        {
          saveIds: ["save-b", "save-a", "missing"],
          labels: [" Design ", "Recipes", "design"],
        },
        embed,
        "current-media-model",
      ),
    ).resolves.toEqual({
      items: [
        {
          id: "save-a",
          scores: [
            { label: "Design", score: 1 },
            { label: "Recipes", score: 0 },
          ],
        },
        {
          id: "save-b",
          scores: [
            { label: "Recipes", score: 1 },
            { label: "Design", score: 0 },
          ],
        },
      ],
      excludedIds: ["missing"],
    });
    expect(candidateModels).toEqual(["current-media-model"]);
    expect(embedded).toEqual([
      [
        "task: classification | query: Design",
        "task: classification | query: Recipes",
      ],
    ]);
  });
});

describe("saves.classifyLabels input", () => {
  it("bounds the selected Saves and user-provided labels", () => {
    const schema = savesReadQueries["saves.classifyLabels"].inputSchema;

    expect(
      schema.safeParse({ saveIds: ["save-a"], labels: ["Design"] }).success,
    ).toBe(true);
    expect(schema.safeParse({ saveIds: [], labels: ["Design"] }).success).toBe(
      false,
    );
    expect(schema.safeParse({ saveIds: ["save-a"], labels: [] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        saveIds: Array.from({ length: 2001 }, (_, index) => `save-${index}`),
        labels: ["Design"],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        saveIds: ["save-a"],
        labels: Array.from({ length: 51 }, (_, index) => `Label ${index}`),
      }).success,
    ).toBe(false);
  });
});
