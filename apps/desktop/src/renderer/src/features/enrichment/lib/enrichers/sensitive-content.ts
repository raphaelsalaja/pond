import type { RawImage } from "@huggingface/transformers";
import { isManualSensitiveDecision } from "@pond/schema/content-safety";
import {
  buildOriginalMediaUnits,
  type MediaUnit,
} from "@/features/saves/media";
import type { Save } from "@/features/saves/types";
import { loadImage } from "../image";
import {
  aggregateSensitiveScores,
  classifySensitiveImages,
  SENSITIVE_CONTENT_MODEL_VERSION,
} from "../sensitive-content";
import type { Enricher } from "../types";

const CLEARED = { sensitiveScore: null, sensitiveModel: null };

async function loadSample(
  bytes: Uint8Array,
  mimeType: string,
): Promise<RawImage> {
  const { RawImage } = await import("@huggingface/transformers");
  return RawImage.fromBlob(
    new Blob([Uint8Array.from(bytes).buffer], { type: mimeType }),
  );
}

async function visualScores(units: MediaUnit[]): Promise<number[]> {
  const imageUrls = new Set<string>();
  for (const unit of units) {
    if (unit.isVideo) {
      if (unit.posterUrl) imageUrls.add(unit.posterUrl);
    } else {
      imageUrls.add(unit.url);
    }
  }

  const imageResults = await Promise.allSettled(
    [...imageUrls].map((url) => loadImage(url)),
  );
  const images = imageResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const scores = images.length > 0 ? await classifySensitiveImages(images) : [];

  for (const unit of units) {
    if (!unit.isVideo) continue;
    try {
      const result = await window.pond.query("video.sampleFrames", {
        src: unit.url,
        maxFrames: 12,
      });
      if (!result.ok) continue;
      const decoded = await Promise.allSettled(
        result.frames.map((sample) =>
          loadSample(sample.bytes, sample.mimeType),
        ),
      );
      const frames = decoded.flatMap((frame) =>
        frame.status === "fulfilled" ? [frame.value] : [],
      );
      if (frames.length > 0) {
        scores.push(...(await classifySensitiveImages(frames)));
      }
    } catch {}
  }
  return scores;
}

export const sensitiveContentEnricher: Enricher = {
  id: "sensitive-content",
  enabled: (prefs) => prefs?.ai?.enableSensitiveContent === true,
  eligible(save: Save) {
    if (save.status !== "complete" || save.deletedAt != null) return false;
    if (isManualSensitiveDecision(save.sensitiveModel)) return false;
    /** A rendered post card is not the Save's media, so text-only posts carry no result. */
    if (buildOriginalMediaUnits(save).length === 0) {
      return save.sensitiveModel != null;
    }
    return save.sensitiveModel !== SENSITIVE_CONTENT_MODEL_VERSION;
  },
  async run(save: Save) {
    const units = buildOriginalMediaUnits(save);
    if (units.length === 0) return { derived: CLEARED, optimistic: CLEARED };
    const sensitiveScore = aggregateSensitiveScores(await visualScores(units));
    if (sensitiveScore == null) return null;
    const fields = {
      sensitiveScore,
      sensitiveModel: SENSITIVE_CONTENT_MODEL_VERSION,
    };
    return { derived: fields, optimistic: fields };
  },
};
