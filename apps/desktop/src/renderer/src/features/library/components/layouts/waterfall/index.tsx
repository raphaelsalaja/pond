import { useMemo } from "react";
import type { ReactNode } from "react";
import { SavePackedGrid } from "@/features/library/components/layouts/packed-grid";
import { packWaterfall } from "@/features/library/components/layouts/packing";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { useGridMin } from "@/features/library/hooks/use-grid-min";
import { chromeHeightFor } from "@/features/library/lib/library-chrome";
import { useDeferredGridWidth } from "@/features/library/state/shell-state";
import {
  useDisplayPrefs,
  useItemInfo,
  useMediaPickOptions,
} from "@/features/saves";
import { layoutAspectFor, useAspectVersion } from "@/features/saves/media";
import type { Save } from "@/features/saves/types";

interface WaterfallViewProps {
  saves: ReadonlyArray<Save>;
  lead?: ReadonlyArray<Save>;
  divider?: ReactNode;
  onEndReached?: () => void;
}

export function WaterfallView({
  saves,
  lead,
  divider,
  onEndReached,
}: WaterfallViewProps) {
  const width = useDeferredGridWidth();
  const colMin = useGridMin();
  const gap = useLibrarySaveGap();
  const prefs = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const chromeHeight = chromeHeightFor(prefs, itemInfo.visible);
  const aspectVersion = useAspectVersion();
  const pickOpts = useMediaPickOptions();

  const packs = useMemo(() => {
    void aspectVersion;
    const pack = (list: ReadonlyArray<Save>) =>
      packWaterfall(
        list.map((save) => ({
          id: save.id,
          aspect: layoutAspectFor(save, pickOpts),
        })),
        width,
        colMin,
        gap,
        chromeHeight,
      );
    return { rest: pack(saves), lead: lead?.length ? pack(lead) : undefined };
  }, [saves, lead, width, colMin, gap, chromeHeight, aspectVersion, pickOpts]);

  return (
    <SavePackedGrid
      layout="waterfall"
      items={packs.rest.items}
      totalHeight={packs.rest.totalHeight}
      lead={packs.lead}
      divider={divider}
      onEndReached={onEndReached}
    />
  );
}
