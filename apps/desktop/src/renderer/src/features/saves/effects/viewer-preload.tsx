import { useEffect } from "react";
import { useSave } from "@/features/saves/hooks/use-saves";
import {
  cancelPreload,
  PRELOAD_SETTLE_MS,
  preloadImage,
  saveImageUrls,
} from "@/features/saves/lib/media/preload";
import { useSelectionCursor } from "@/features/saves/state/selection";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { useStableStrings } from "@/shared/hooks/use-stable-array";

const NO_URLS: ReadonlyArray<string> = [];

export function ViewerPreload({ details }: { details: boolean }) {
  const theme = useResolvedTheme();
  const cursor = useSelectionCursor();
  const save = useSave(cursor);
  const urls = useStableStrings(
    save ? saveImageUrls(save, theme, { details }) : NO_URLS,
  );

  useEffect(() => {
    if (urls.length === 0) return;
    let started = false;
    const timer = window.setTimeout(() => {
      started = true;
      for (const url of urls) preloadImage(url);
    }, PRELOAD_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      if (started) for (const url of urls) cancelPreload(url);
    };
  }, [urls]);

  return null;
}
