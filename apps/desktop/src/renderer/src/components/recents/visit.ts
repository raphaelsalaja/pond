import { useEffect } from "react";
import { recordVisit } from "./store";

export function useTrackVisit(saveId: string | null | undefined): void {
  useEffect(() => {
    if (!saveId) return;
    recordVisit(saveId);
  }, [saveId]);
}
