import { type ReactNode, useMemo } from "react";
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
  lead?: ReadonlyArray<Save>;
  divider?: ReactNode;
  onEndReached?: () => void;
}

export function GridView({
  saves,
  lead,
  divider,
  onEndReached,
}: GridViewProps) {
  const width = useDeferredGridWidth();
  const colMin = useGridMin();
  const gap = useLibrarySaveGap();
  const prefs = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const chromeHeight = chromeHeightFor(prefs, itemInfo.visible);

  const packs = useMemo(() => {
    const pack = (list: ReadonlyArray<Save>) =>
      packGrid(
        list.map((s) => s.id),
        width,
        colMin,
        gap,
        chromeHeight,
      );
    return { rest: pack(saves), lead: lead?.length ? pack(lead) : undefined };
  }, [saves, lead, width, colMin, gap, chromeHeight]);

  return (
    <SavePackedGrid
      layout="grid"
      items={packs.rest.items}
      totalHeight={packs.rest.totalHeight}
      lead={packs.lead}
      divider={divider}
      onEndReached={onEndReached}
    />
  );
}
