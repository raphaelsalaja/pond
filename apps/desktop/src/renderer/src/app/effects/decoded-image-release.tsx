import { shouldReleaseDecodedImages } from "@shared/decoded-image-release";
import type { DecodedImageHold } from "@shared/decoded-image-release";
import { useEffect } from "react";
import { openSaveId } from "@/features/saves/lib/save-nav";
import { getAppRouter } from "@/shared/lib/app-router";
import {
  readMachinePace,
  subscribeMachinePace,
} from "@/shared/lib/machine-pace";
import { currentRouteMeta } from "@/shared/lib/route-meta";

function hold(): DecodedImageHold | null {
  const meta = currentRouteMeta();
  if (!meta) return null;
  return {
    surface: meta.surface,
    viewerOpen: openSaveId() !== null,
    memoryPressure: readMachinePace().memoryPressure ?? "normal",
  };
}

/** Drops decoded images Blink is no longer drawing, after the view has unmounted them. */
export function DecodedImageRelease(): null {
  useEffect(() => {
    const router = getAppRouter();
    if (!router) return;
    let previous: DecodedImageHold | null = null;
    let generation = 0;

    const consider = (): void => {
      const next = hold();
      if (!next) return;
      const release = shouldReleaseDecodedImages(previous, next);
      previous = next;
      if (!release) return;
      const token = ++generation;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token !== generation) return;
          window.pond.releaseDecodedImages();
        });
      });
    };

    const unsubscribe = router.subscribe("onResolved", consider);
    const unsubscribePace = subscribeMachinePace(consider);
    consider();
    return () => {
      unsubscribe();
      unsubscribePace();
      generation += 1;
    };
  }, []);
  return null;
}
