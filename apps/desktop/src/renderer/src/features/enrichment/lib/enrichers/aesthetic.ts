import type { Save } from "@/features/saves/types";
import { clipAesthetic, mediaModelVersion } from "../clip";
import { loadImage, representativeImageUrl } from "../image";
import type { Enricher } from "../types";

export const aestheticEnricher: Enricher = {
  id: "aesthetic",
  enabled: (prefs) => prefs?.ai?.enableAesthetic === true,
  eligible(save: Save) {
    if (save.status !== "complete" || save.deletedAt !== null) {
      return false;
    }
    if (!representativeImageUrl(save)) {
      return false;
    }
    return save.aestheticModel !== mediaModelVersion();
  },
  async run(save: Save) {
    const url = representativeImageUrl(save);
    if (!url) {
      return null;
    }
    const image = await loadImage(url);
    const labels = await clipAesthetic(image);
    const model = mediaModelVersion();
    const fields = { aesthetic: labels, aestheticModel: model };
    return { derived: fields, optimistic: fields };
  },
};
