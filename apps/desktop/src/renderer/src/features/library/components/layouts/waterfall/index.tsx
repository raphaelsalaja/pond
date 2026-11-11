import { useMemo } from "react";
import { SavePackedGrid } from "@/features/library/components/layouts/packed-grid";
import { packWaterfall } from "@/features/library/components/layouts/packing";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { useGridMin } from "@/features/library/hooks/use-grid-min";
import { chromeHeightFor } from "@/features/library/lib/library-chrome";
import { useGridWidth } from "@/features/library/state/shell-state";
import {
  useDisplayPrefs,
  useItemInfo,
  useMediaPickOptions,
} from "@/features/saves";
import { layoutAspectFor, useAspectVersion } from "@/features/saves/media";
import type { Save } from "@/features/saves/types";

interface WaterfallViewProps {
  saves: ReadonlyArray<Save>;
  onEndReached?: () => void;
}

export function WaterfallView({ saves, onEndReached }: WaterfallViewProps) {
  const width = useGridWidth();
  const colMin = useGridMin();
  const gap = useLibrarySaveGap();
  const prefs = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const chromeHeight = chromeHeightFor(prefs, itemInfo.visible);
  const aspectVersion = useAspectVersion();
  const pickOpts = useMediaPickOptions();

  const { items, totalHeight } = useMemo(() => {
    void aspectVersion;
    return packWaterfall(
      saves.map((save) => ({
        id: save.id,
        aspect: layoutAspectFor(save, pickOpts),
      })),
      width,
      colMin,
      gap,
      chromeHeight,
    );
  }, [saves, width, colMin, gap, chromeHeight, aspectVersion, pickOpts]);

  return (
    <SavePackedGrid
      layout="waterfall"
      items={items}
      totalHeight={totalHeight}
      onEndReached={onEndReached}
    />
  );
}
