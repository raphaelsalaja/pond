export const EMBEDDING_BENCHMARK_DIMENSIONS = [768, 512, 256, 128] as const;

export type EmbeddingBenchmarkDimension =
  (typeof EMBEDDING_BENCHMARK_DIMENSIONS)[number];
export type EmbeddingBenchmarkModality = "text" | "image" | "audio" | "video";

export interface EmbeddingBenchmarkDocument {
  id: string;
  modality: EmbeddingBenchmarkModality;
  vector: Array<number>;
}

export interface EmbeddingBenchmarkQuery {
  id: string;
  modality: EmbeddingBenchmarkModality;
  relevantIds: Array<string>;
  vector: Array<number>;
}

export interface EmbeddingBenchmarkCorpus {
  kind: "held-out" | "smoke";
  representative: boolean;
  importantModalities: Array<EmbeddingBenchmarkModality>;
  documents: Array<EmbeddingBenchmarkDocument>;
  queries: Array<EmbeddingBenchmarkQuery>;
}

export interface EmbeddingBenchmarkMetricSlice {
  queries: number;
  recallAt10: number;
  meanReciprocalRank: number;
}

export interface EmbeddingDimensionResult {
  dimensions: number;
  recallAt10: number;
  meanReciprocalRank: number;
  rawVectorBytes: number;
  sqliteVecDatabaseBytes?: number;
  slices: Partial<
    Record<EmbeddingBenchmarkModality, EmbeddingBenchmarkMetricSlice>
  >;
}

export const DIMENSION_ACCEPTANCE_RULE = {
  baselineDimensions: 768,
  candidateDimensions: 256,
  maxOverallRecallLossPoints: 1,
  maxModalityRecallLossPoints: 2,
  prohibit128ForMultimodal: true,
} as const;

const ALL_MODALITIES = ["text", "image", "audio", "video"] as const;
const FLOAT_COMPARISON_EPSILON = 1e-9;

export function truncateAndNormalizeEmbedding(
  vector: ArrayLike<number>,
  dimensions: number,
): Array<number> {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error("embedding dimensions must be a positive integer");
  }
  if (vector.length < dimensions) {
    throw new Error(
      `cannot truncate ${vector.length} values to ${dimensions} dimensions`,
    );
  }

  let magnitudeSquared = 0;
  const truncated = Array.from({ length: dimensions }, (_, index) => {
    const value = vector[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error("embedding contains a non-finite value");
    }
    magnitudeSquared += value * value;
    return value;
  });
  if (!Number.isFinite(magnitudeSquared) || magnitudeSquared <= 0) {
    throw new Error("truncated embedding has zero magnitude");
  }

  const magnitude = Math.sqrt(magnitudeSquared);
  return truncated.map((value) => value / magnitude);
}

function average(values: Array<number>): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dot(left: Array<number>, right: Array<number>): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return score;
}

export function evaluateEmbeddingDimension(
  corpus: EmbeddingBenchmarkCorpus,
  dimensions: EmbeddingBenchmarkDimension,
): EmbeddingDimensionResult {
  const documents = corpus.documents.map((document) => ({
    ...document,
    vector: truncateAndNormalizeEmbedding(document.vector, dimensions),
  }));
  const perQuery = corpus.queries.map((query) => {
    const queryVector = truncateAndNormalizeEmbedding(query.vector, dimensions);
    const rankedIds = documents
      .map((document) => ({
        id: document.id,
        score: dot(queryVector, document.vector),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      )
      .map(({ id }) => id);
    const relevantIds = new Set(query.relevantIds);
    const relevantInTopTen = rankedIds
      .slice(0, 10)
      .filter((id) => relevantIds.has(id)).length;
    const firstRelevantIndex = rankedIds.findIndex((id) => relevantIds.has(id));
    return {
      modality: query.modality,
      recallAt10: relevantInTopTen / relevantIds.size,
      reciprocalRank:
        firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1),
    };
  });

  const slices: EmbeddingDimensionResult["slices"] = {};
  for (const modality of ALL_MODALITIES) {
    const queries = perQuery.filter((query) => query.modality === modality);
    if (queries.length === 0) continue;
    slices[modality] = {
      queries: queries.length,
      recallAt10: average(queries.map((query) => query.recallAt10)),
      meanReciprocalRank: average(queries.map((query) => query.reciprocalRank)),
    };
  }

  return {
    dimensions,
    recallAt10: average(perQuery.map((query) => query.recallAt10)),
    meanReciprocalRank: average(perQuery.map((query) => query.reciprocalRank)),
    rawVectorBytes:
      corpus.documents.length * dimensions * Float32Array.BYTES_PER_ELEMENT,
    slices,
  };
}

export interface EmbeddingDimensionDecision {
  accepted: boolean;
  overallRecallLossPoints: number;
  modalityRecallLossPoints: Partial<Record<EmbeddingBenchmarkModality, number>>;
  reasons: Array<string>;
}

export function assessCompactDimension(
  corpus: EmbeddingBenchmarkCorpus,
  baseline: EmbeddingDimensionResult,
  candidate: EmbeddingDimensionResult,
): EmbeddingDimensionDecision {
  const reasons: Array<string> = [];
  const modalityRecallLossPoints: EmbeddingDimensionDecision["modalityRecallLossPoints"] =
    {};
  const overallRecallLossPoints =
    (baseline.recallAt10 - candidate.recallAt10) * 100;

  if (corpus.kind !== "held-out" || !corpus.representative) {
    reasons.push("adoption requires a representative held-out corpus");
  }
  const coveredModalities = new Set(corpus.importantModalities);
  if (!ALL_MODALITIES.every((modality) => coveredModalities.has(modality))) {
    reasons.push(
      "adoption requires important slices for text, image, audio, and video",
    );
  }
  if (candidate.dimensions === 128 && coveredModalities.size > 1) {
    reasons.push("128 dimensions are prohibited for multimodal retrieval");
  }
  if (baseline.dimensions !== DIMENSION_ACCEPTANCE_RULE.baselineDimensions) {
    reasons.push(
      `the baseline must use ${DIMENSION_ACCEPTANCE_RULE.baselineDimensions} dimensions`,
    );
  }
  if (candidate.dimensions !== DIMENSION_ACCEPTANCE_RULE.candidateDimensions) {
    reasons.push(
      `the adoption rule applies only to ${DIMENSION_ACCEPTANCE_RULE.candidateDimensions} dimensions`,
    );
  }
  if (
    overallRecallLossPoints >
    DIMENSION_ACCEPTANCE_RULE.maxOverallRecallLossPoints +
      FLOAT_COMPARISON_EPSILON
  ) {
    reasons.push(
      `overall Recall@10 lost ${overallRecallLossPoints.toFixed(2)} points (maximum ${DIMENSION_ACCEPTANCE_RULE.maxOverallRecallLossPoints})`,
    );
  }

  for (const modality of corpus.importantModalities) {
    const baselineSlice = baseline.slices[modality];
    const candidateSlice = candidate.slices[modality];
    if (!baselineSlice || !candidateSlice) {
      reasons.push(`${modality} has no comparable held-out slice`);
      continue;
    }
    const loss = (baselineSlice.recallAt10 - candidateSlice.recallAt10) * 100;
    modalityRecallLossPoints[modality] = loss;
    if (
      loss >
      DIMENSION_ACCEPTANCE_RULE.maxModalityRecallLossPoints +
        FLOAT_COMPARISON_EPSILON
    ) {
      reasons.push(
        `${modality} Recall@10 lost ${loss.toFixed(2)} points (maximum ${DIMENSION_ACCEPTANCE_RULE.maxModalityRecallLossPoints})`,
      );
    }
  }

  return {
    accepted: reasons.length === 0,
    overallRecallLossPoints,
    modalityRecallLossPoints,
    reasons,
  };
}
