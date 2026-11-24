import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import { completeLibraryLayoutTransition } from "@/features/library/lib/library-layout-transition";

export function useLibraryLayoutTransition<Version>(
  ref: RefObject<HTMLElement | null>,
  layoutVersion: Version,
): void {
  useLayoutEffect(() => {
    void layoutVersion;
    const container = ref.current;
    if (container) {
      completeLibraryLayoutTransition(container);
    }
  }, [ref, layoutVersion]);
}
