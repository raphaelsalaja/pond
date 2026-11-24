import { DEFAULT_PREFS } from "@pond/schema";
import type { Save } from "@/features/saves/types";
import { representativeImageUrl } from "../image";
import { mediaUnderstandingRouter } from "../media-understanding-router";
import type { MediaUnderstandingRouter } from "../media-understanding-router";
import type { Enricher } from "../types";

export function createCaptionEnricher(
  router: MediaUnderstandingRouter = mediaUnderstandingRouter,
): Enricher {
  return {
    id: "caption",
    enabled: (prefs) => prefs?.ai?.enableCaption === true,
    eligible(save: Save, prefs = DEFAULT_PREFS.ai) {
      if (save.status !== "complete" || save.deletedAt !== null) {
        return false;
      }
      if (!representativeImageUrl(save)) {
        return false;
      }
      return save.captionModel !== router.primaryModel("caption", prefs);
    },
    async run(save: Save, prefs = DEFAULT_PREFS.ai) {
      const imageUrl = representativeImageUrl(save);
      if (!imageUrl) {
        return null;
      }
      const result = await router.run({
        saveId: save.id,
        imageUrl,
        task: "caption",
        prefs,
      });
      const fields = {
        caption: result.text || null,
        captionModel: result.model,
      };
      return { derived: fields, optimistic: fields };
    },
  };
}

export const captionEnricher = createCaptionEnricher();
