import { describe, expect, it, vi } from "vitest";
import { embedModelVersion } from "@/features/enrichment/lib/embeddings";
import type { Save } from "@/features/saves/types";
import {
  createSuggestedTagsEnricher,
  SUGGESTED_TAGS_VOCAB_RETRY_MS,
} from "./suggested-tags";
import type { SuggestedTagsDependencies } from "./suggested-tags";

function save(overrides: Partial<Save> = {}): Save {
  return {
    id: "save-1",
    source: "local",
    sourceId: "source-1",
    url: "",
    title: "Glaze tests",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [],
    tags: [],
    status: "complete",
    embeddingModel: embedModelVersion(),
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function unit(index: number): Float32Array {
  const vector = new Float32Array(2);
  vector[index] = 1;
  return vector;
}

function dependencies(
  overrides: Partial<SuggestedTagsDependencies> = {},
): SuggestedTagsDependencies {
  return {
    listTags: async () => [{ name: "ceramic" }, { name: "glaze" }],
    embedSearchQueries: async (texts) => texts.map(() => unit(0)),
    embeddingFor: async () => ({ vec: unit(0) }),
    now: () => 0,
    ...overrides,
  };
}

async function failingEmbed(): Promise<Array<Float32Array>> {
  throw new Error("embed failed");
}

describe("suggested tags vocab", () => {
  it("does not rebuild a failed vocab on the next save", async () => {
    const deps = dependencies({ embedSearchQueries: failingEmbed });
    const embedSearchQueries = vi.spyOn(deps, "embedSearchQueries");
    const enricher = createSuggestedTagsEnricher(deps);

    await expect(enricher.run(save())).rejects.toThrow("embed failed");
    await expect(enricher.run(save({ id: "save-2" }))).rejects.toThrow(
      "embed failed",
    );
    expect(embedSearchQueries).toHaveBeenCalledTimes(1);
  });

  it("rebuilds after the tag list changes", async () => {
    let tags = [{ name: "ceramic" }, { name: "glaze" }];
    const deps = dependencies({
      listTags: async () => tags,
      embedSearchQueries: failingEmbed,
    });
    const embedSearchQueries = vi.spyOn(deps, "embedSearchQueries");
    const enricher = createSuggestedTagsEnricher(deps);

    await expect(enricher.run(save())).rejects.toThrow("embed failed");
    tags = [{ name: "ceramic" }, { name: "glaze" }, { name: "kiln" }];
    await expect(enricher.run(save({ id: "save-2" }))).rejects.toThrow(
      "embed failed",
    );
    expect(embedSearchQueries).toHaveBeenCalledTimes(2);
    expect(embedSearchQueries).toHaveBeenNthCalledWith(2, [
      "ceramic",
      "glaze",
      "kiln",
    ]);
  });

  it("rebuilds after the cooldown elapses", async () => {
    let now = 0;
    const deps = dependencies({
      embedSearchQueries: failingEmbed,
      now: () => now,
    });
    const embedSearchQueries = vi.spyOn(deps, "embedSearchQueries");
    const enricher = createSuggestedTagsEnricher(deps);

    await expect(enricher.run(save())).rejects.toThrow("embed failed");
    now = SUGGESTED_TAGS_VOCAB_RETRY_MS - 1;
    await expect(enricher.run(save({ id: "save-2" }))).rejects.toThrow(
      "embed failed",
    );
    expect(embedSearchQueries).toHaveBeenCalledTimes(1);

    now = SUGGESTED_TAGS_VOCAB_RETRY_MS;
    await expect(enricher.run(save({ id: "save-3" }))).rejects.toThrow(
      "embed failed",
    );
    expect(embedSearchQueries).toHaveBeenCalledTimes(2);
  });

  it("rebuilds a successful vocab when tags are added", async () => {
    let tags = [{ name: "ceramic" }];
    const deps = dependencies({ listTags: async () => tags });
    const embedSearchQueries = vi.spyOn(deps, "embedSearchQueries");
    const enricher = createSuggestedTagsEnricher(deps);

    await enricher.run(save());
    await enricher.run(save({ id: "save-2", suggestedTagsModel: null }));
    expect(embedSearchQueries).toHaveBeenCalledTimes(1);

    tags = [{ name: "ceramic" }, { name: "glaze" }];
    await enricher.run(save({ id: "save-3", suggestedTagsModel: null }));
    expect(embedSearchQueries).toHaveBeenCalledTimes(2);
  });
});
