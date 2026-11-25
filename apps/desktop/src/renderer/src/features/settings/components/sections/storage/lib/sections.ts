import type { Breakdown } from "../breakdown/storage-segments";

export const INSIGHTS_SECTION_ID = "storage-insights";
export const CACHES_SECTION_ID = "storage-caches";

type StorageSectionId = typeof INSIGHTS_SECTION_ID | typeof CACHES_SECTION_ID;

export function sectionForCategory(
  category: keyof Breakdown,
): StorageSectionId | null {
  if (category === "items") {
    return INSIGHTS_SECTION_ID;
  }
  if (category === "videoCache" || category === "thumbs") {
    return CACHES_SECTION_ID;
  }
  return null;
}
