import type { Breakdown } from "../breakdown/storage-segments";

export const INSIGHTS_SECTION_ID = "storage-insights";
export const CACHES_SECTION_ID = "storage-caches";

export const SECTION_FOR_CATEGORY: Partial<Record<keyof Breakdown, string>> = {
  items: INSIGHTS_SECTION_ID,
  videoCache: CACHES_SECTION_ID,
  thumbs: CACHES_SECTION_ID,
};
