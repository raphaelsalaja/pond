import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  embeddingQueryText,
  modelCacheDir,
  queryEmbeddingChannels,
  reciprocalRankFusion,
} from "./query-embeddings";

describe("hybrid retrieval ranking", () => {
  it("uses the explicit retrieval task prefix", () => {
    expect(embeddingQueryText("search", "  ceramic   glaze ")).toBe(
      "task: search result | query: ceramic glaze",
    );
    expect(embeddingQueryText("code", "parse a URL")).toBe(
      "task: code retrieval | query: parse a URL",
    );
    expect(
      embeddingQueryText("fact-check", "The file was edited yesterday"),
    ).toBe("task: fact checking | query: The file was edited yesterday");
  });

  it("scores compatible normalized vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [1])).toBeNull();
  });

  it("uses reciprocal-rank fusion across independent channels", () => {
    const fused = reciprocalRankFusion([
      ["exact", "shared"],
      ["visual", "shared"],
    ]);
    expect(fused[0]?.id).toBe("shared");
    expect(new Set(fused.map((entry) => entry.id))).toEqual(
      new Set(["exact", "shared", "visual"]),
    );
  });

  it("deduplicates repeated IDs within a single rank list", () => {
    const fused = reciprocalRankFusion([["one", "one"]]);
    expect(fused).toHaveLength(1);
  });

  it("selects document-text and media channels independently without loading a model", () => {
    expect(
      queryEmbeddingChannels([], {
        semanticSearch: true,
        enableClip: true,
      }),
    ).toEqual({ text: true, media: true });
    expect(
      queryEmbeddingChannels(["video"], {
        semanticSearch: false,
        enableClip: true,
      }),
    ).toEqual({ text: false, media: true });
    expect(
      queryEmbeddingChannels(["image"], {
        semanticSearch: false,
        enableClip: true,
      }),
    ).toEqual({ text: false, media: true });
    expect(
      queryEmbeddingChannels(["audio"], {
        semanticSearch: true,
        enableClip: false,
      }),
    ).toEqual({ text: true, media: false });
    expect(
      queryEmbeddingChannels(["document"], {
        semanticSearch: false,
        enableClip: true,
      }),
    ).toEqual({ text: false, media: false });
  });
});

describe("modelCacheDir", () => {
  it("keeps downloaded models in user data on Windows only", () => {
    expect(modelCacheDir("win32", "/data")).toBe(join("/data", "models"));
    expect(modelCacheDir("darwin", "/data")).toBeUndefined();
    expect(modelCacheDir("linux", "/data")).toBeUndefined();
  });
});
