import { useEffect } from "react";
import { useSave } from "@/features/saves/hooks/use-saves";
import {
  PRELOAD_SETTLE_MS,
  preloadImage,
  viewerImageUrl,
} from "@/features/saves/lib/media/preload";
import { useSelectionCursor } from "@/features/saves/state/selection";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";

export function ViewerPreload() {
  const theme = useResolvedTheme();
  const cursor = useSelectionCursor();
  const save = useSave(cursor);
  const url = save ? viewerImageUrl(save, theme) : null;

  useEffect(() => {
    if (!url) return;
    const timer = window.setTimeout(() => preloadImage(url), PRELOAD_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [url]);

  return null;
}
