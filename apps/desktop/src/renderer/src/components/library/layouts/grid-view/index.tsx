import { useMemo } from "react";
import {
  LIBRARY_ITEM_GAP,
  packUniform,
  SavePackedGrid,
} from "@/components/library/layouts/packed-grid";
import { useGridMin } from "@/hooks/use-grid-min";
import type { Save } from "@/lib/types";
import { chromeHeightFor } from "@/lib/ui/library-chrome";
import { useDisplayPrefs } from "@/stores/display-prefs";
import { useGridWidth } from "@/stores/shell-state";

interface GridViewProps {
  saves: ReadonlyArray<Save>;
  onEndReached?: () => void;
}

export function GridView({ saves, onEndReached }: GridViewProps) {
  const width = useGridWidth();
  const colMin = useGridMin();
  const prefs = useDisplayPrefs();
  const chromeHeight = chromeHeightFor(prefs);

  const { items, totalHeight } = useMemo(
    () =>
      packUniform(
        saves.map((s) => s.id),
        width,
        colMin,
        LIBRARY_ITEM_GAP,
        /** Square media: height equals column width, plus the meta chrome underneath. */
        (colW) => colW + chromeHeight,
      ),
    [saves, width, colMin, chromeHeight],
  );

  return (
    <SavePackedGrid
      layout="grid"
      items={items}
      totalHeight={totalHeight}
      onEndReached={onEndReached}
    />
  );
}
