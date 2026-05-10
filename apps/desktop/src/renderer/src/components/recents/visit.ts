import { useEffect } from "react";
import { recordVisit } from "./store";

/**
 * Record that the user just opened the given save. Mounted by
 * `<SaveDetail>`; one call per visit. The store dedupes on save id,
 * so revisiting the same save from a different list view promotes
 * the existing entry instead of double-listing.
 */
export function useTrackVisit(saveId: string | null | undefined): void {
  useEffect(() => {
    if (!saveId) return;
    recordVisit(saveId);
  }, [saveId]);
}
