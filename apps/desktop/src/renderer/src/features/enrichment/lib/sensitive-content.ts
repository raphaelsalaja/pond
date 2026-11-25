import type { RawImage } from "@huggingface/transformers";
import { inferSensitiveContent } from "./inference-client";

export {
  aggregateSensitiveScores,
  SENSITIVE_CONTENT_MODEL_VERSION,
  sensitiveProbabilitiesFromLogits,
} from "./sensitive-content-contract";

export function classifySensitiveImages(
  images: Array<RawImage>,
): Promise<Array<number>> {
  return inferSensitiveContent(images);
}
