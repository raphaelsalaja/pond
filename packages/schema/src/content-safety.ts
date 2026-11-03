export const SENSITIVE_CONTENT_BANDS = [
  "not-sensitive",
  "possible-sensitive",
  "likely-sensitive",
  "not-checked",
] as const;

export type SensitiveContentBand = (typeof SENSITIVE_CONTENT_BANDS)[number];

export const POSSIBLE_SENSITIVE_THRESHOLD = 0.5;
export const LIKELY_SENSITIVE_THRESHOLD = 0.8;

export function sensitiveContentBand(
  score: number | null | undefined,
): SensitiveContentBand {
  if (score == null || !Number.isFinite(score) || score < 0 || score > 1) {
    return "not-checked";
  }
  if (score >= LIKELY_SENSITIVE_THRESHOLD) return "likely-sensitive";
  if (score >= POSSIBLE_SENSITIVE_THRESHOLD) return "possible-sensitive";
  return "not-sensitive";
}

/**
 * A person can correct a classifier result. The stamp lives in `sensitiveModel`
 * so a later analysis pass can tell that correction from a model version.
 * `sensitiveScore` still drives blur and filters.
 */
export const MANUAL_NOT_SENSITIVE_MODEL = "manual:not-sensitive";
export const MANUAL_LIKELY_SENSITIVE_MODEL = "manual:likely-sensitive";

export function isManualSensitiveDecision(
  model: string | null | undefined,
): boolean {
  return (
    model === MANUAL_NOT_SENSITIVE_MODEL ||
    model === MANUAL_LIKELY_SENSITIVE_MODEL
  );
}

export function manualSensitiveDecision(sensitive: boolean): {
  sensitiveScore: number;
  sensitiveModel: string;
} {
  return sensitive
    ? { sensitiveScore: 1, sensitiveModel: MANUAL_LIKELY_SENSITIVE_MODEL }
    : { sensitiveScore: 0, sensitiveModel: MANUAL_NOT_SENSITIVE_MODEL };
}
