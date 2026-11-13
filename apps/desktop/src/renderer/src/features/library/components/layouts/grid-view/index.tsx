import { useMemo } from "react";
import { SavePackedGrid } from "@/features/library/components/layouts/packed-grid";
import { packGrid } from "@/features/library/components/layouts/packing";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { useGridMin } from "@/features/library/hooks/use-grid-min";
import { chromeHeightFor } from "@/features/library/lib/library-chrome";
import { useDeferredGridWidth } from "@/features/library/state/shell-state";
import { useDisplayPrefs, useItemInfo } from "@/features/saves";
import type { Save } from "@/features/saves/types";

interface GridViewProps {
  saves: ReadonlyArray<Save>;
  onEndReached?: () => void;
}

export function GridView({ saves, onEndReached }: GridViewProps) {
  const width = useDeferredGridWidth();
  const colMin = useGridMin();
  const gap = useLibrarySaveGap();
  const prefs = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const chromeHeight = chromeHeightFor(prefs, itemInfo.visible);

  const { items, totalHeight } = useMemo(
    () =>
      packGrid(
        saves.map((s) => s.id),
        width,
        colMin,
        gap,
        chromeHeight,
      ),
    [saves, width, colMin, gap, chromeHeight],
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
