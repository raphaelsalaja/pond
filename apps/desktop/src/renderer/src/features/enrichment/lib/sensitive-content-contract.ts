const MODEL_REPO = "onnx-community/nsfw-image-detector-ONNX";
const MODEL_FILE = "onnx/model_q4f16.onnx";

const SENSITIVE_CONTENT_MODEL_REVISION =
  "6626debca038a8f7aa1729b1eaee3bd4eb929ad6" as const;
export const SENSITIVE_CONTENT_MODEL_SHA256 =
  "adf6ed161bbccb7a1b5d189760658043a11932b8f17b7bc399209778c7e96aa2" as const;
export const SENSITIVE_CONTENT_MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/${SENSITIVE_CONTENT_MODEL_REVISION}/${MODEL_FILE}`;
export const SENSITIVE_CONTENT_MODEL_VERSION = `${MODEL_REPO}@${SENSITIVE_CONTENT_MODEL_REVISION}:q4f16:preprocess-2:sampling-1:max-1`;

const LABELS = ["drawings", "hentai", "neutral", "porn", "sexy"] as const;
const SENSITIVE_LABELS = new Set<(typeof LABELS)[number]>([
  "hentai",
  "porn",
  "sexy",
]);

export function sensitiveProbabilitiesFromLogits(
  logits: ArrayLike<number>,
): Array<number> {
  if (logits.length === 0 || logits.length % LABELS.length !== 0) {
    throw new Error("Expected sensitive-content logits for every label");
  }
  const probabilities: Array<number> = [];
  for (let row = 0; row < logits.length; row += LABELS.length) {
    const values = Array.from(LABELS, (_, index) => logits[row + index] ?? 0);
    if (!values.every(Number.isFinite)) {
      throw new Error("Sensitive-content logits must be finite");
    }
    const offset = Math.max(...values);
    const exps = values.map((value) => Math.exp(value - offset));
    const total = exps.reduce((sum, value) => sum + value, 0);
    const sensitive = LABELS.reduce(
      (sum, label, index) =>
        SENSITIVE_LABELS.has(label) ? sum + (exps[index] ?? 0) : sum,
      0,
    );
    probabilities.push(sensitive / total);
  }
  return probabilities;
}

export function aggregateSensitiveScores(
  scores: ReadonlyArray<number>,
): number | null {
  const finite = scores.filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : null;
}
