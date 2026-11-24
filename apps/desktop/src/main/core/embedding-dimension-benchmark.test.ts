import { describe, expect, it } from "vitest";
import {
  assessCompactDimension,
  DIMENSION_ACCEPTANCE_RULE,
  evaluateEmbeddingDimension,
  truncateAndNormalizeEmbedding,
} from "./embedding-dimension-benchmark";
import type { EmbeddingBenchmarkCorpus } from "./embedding-dimension-benchmark";

const vector = (...entries: Array<number>): Array<number> => [
  ...entries,
  ...Array.from({ length: 768 - entries.length }, () => 0),
];

const corpus: EmbeddingBenchmarkCorpus = {
  kind: "held-out",
  representative: true,
  importantModalities: ["text", "image", "audio", "video"],
  documents: [
    { id: "cat", modality: "image", vector: vector(1, 0, 0) },
    { id: "rain", modality: "audio", vector: vector(0, 1, 0) },
    { id: "walk", modality: "video", vector: vector(0, 0, 1) },
  ],
  queries: [
    {
      id: "q-cat",
      modality: "text",
      relevantIds: ["cat"],
      vector: vector(1, 0.01, 0),
    },
    {
      id: "q-rain",
      modality: "audio",
      relevantIds: ["rain"],
      vector: vector(0, 1, 0.01),
    },
  ],
};

describe("embedding dimension benchmark", () => {
  it("truncates before restoring unit length", () => {
    const compact = truncateAndNormalizeEmbedding([3, 4, 12], 2);

    expect(compact).toEqual([0.6, 0.8]);
    expect(Math.hypot(...compact)).toBeCloseTo(1, 12);
  });

  it("reports independently worked retrieval metrics", () => {
    const result = evaluateEmbeddingDimension(corpus, 256);

    expect(result.recallAt10).toBe(1);
    expect(result.meanReciprocalRank).toBe(1);
    expect(result.slices.text).toEqual({
      queries: 1,
      recallAt10: 1,
      meanReciprocalRank: 1,
    });
    expect(result.rawVectorBytes).toBe(3 * 256 * 4);
  });

  it("requires representative held-out evidence and enforces the declared loss limits", () => {
    expect(DIMENSION_ACCEPTANCE_RULE).toMatchObject({
      candidateDimensions: 256,
      maxOverallRecallLossPoints: 1,
      maxModalityRecallLossPoints: 2,
      prohibit128ForMultimodal: true,
    });

    const baseline = {
      ...evaluateEmbeddingDimension(corpus, 768),
      recallAt10: 0.9,
      slices: {
        text: { queries: 1, recallAt10: 0.9, meanReciprocalRank: 1 },
        image: { queries: 1, recallAt10: 0.88, meanReciprocalRank: 1 },
        audio: { queries: 1, recallAt10: 0.86, meanReciprocalRank: 1 },
        video: { queries: 1, recallAt10: 0.84, meanReciprocalRank: 1 },
      },
    };
    const accepted = assessCompactDimension(corpus, baseline, {
      ...baseline,
      dimensions: 256,
      recallAt10: 0.891,
      slices: {
        text: { queries: 1, recallAt10: 0.89, meanReciprocalRank: 1 },
        image: { queries: 1, recallAt10: 0.87, meanReciprocalRank: 1 },
        audio: { queries: 1, recallAt10: 0.85, meanReciprocalRank: 1 },
        video: { queries: 1, recallAt10: 0.82, meanReciprocalRank: 1 },
      },
    });
    expect(accepted.accepted).toBe(true);

    const smoke = assessCompactDimension(
      { ...corpus, kind: "smoke", representative: false },
      baseline,
      { ...baseline, dimensions: 256 },
    );
    expect(smoke.accepted).toBe(false);
    expect(smoke.reasons).toContain(
      "adoption requires a representative held-out corpus",
    );

    const multimodal128 = assessCompactDimension(corpus, baseline, {
      ...baseline,
      dimensions: 128,
    });
    expect(multimodal128.accepted).toBe(false);
    expect(multimodal128.reasons).toContain(
      "128 dimensions are prohibited for multimodal retrieval",
    );

    const degradedAudio = assessCompactDimension(corpus, baseline, {
      ...baseline,
      dimensions: 256,
      recallAt10: 0.891,
      slices: {
        ...baseline.slices,
        audio: { queries: 1, recallAt10: 0.83, meanReciprocalRank: 1 },
      },
    });
    expect(degradedAudio.accepted).toBe(false);
    expect(degradedAudio.reasons).toContain(
      "audio Recall@10 lost 3.00 points (maximum 2)",
    );
  });
});
