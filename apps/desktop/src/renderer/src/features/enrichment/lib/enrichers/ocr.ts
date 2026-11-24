import { DEFAULT_PREFS } from "@pond/schema";
import type { Save } from "@/features/saves/types";
import { representativeImageUrl } from "../image";
import { mediaUnderstandingRouter } from "../media-understanding-router";
import type { MediaUnderstandingRouter } from "../media-understanding-router";
import type { Enricher } from "../types";

export function createOcrEnricher(
  router: MediaUnderstandingRouter = mediaUnderstandingRouter,
): Enricher {
  return {
    id: "ocr",
    enabled: (prefs) => prefs?.ai?.enableOcr === true,
    eligible(save: Save, prefs = DEFAULT_PREFS.ai) {
      if (save.status !== "complete" || save.deletedAt !== null) {
        return false;
      }
      if (!representativeImageUrl(save)) {
        return false;
      }
      return save.ocrModel !== router.primaryModel("ocr", prefs);
    },
    async run(save: Save, prefs = DEFAULT_PREFS.ai) {
      const imageUrl = representativeImageUrl(save);
      if (!imageUrl) {
        return null;
      }
      const result = await router.run({
        saveId: save.id,
        imageUrl,
        task: "ocr",
        prefs,
      });
      const fields = { ocrText: result.text || null, ocrModel: result.model };
      return { derived: fields, optimistic: fields };
    },
  };
}

export const ocrEnricher = createOcrEnricher();
