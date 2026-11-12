import { useMemo } from "react";
import { ListHeader } from "@/features/library/components/layouts/list-header";
import { SavePackedGrid } from "@/features/library/components/layouts/packed-grid";
import { packList } from "@/features/library/components/layouts/packing";
import { useDeferredGridWidth } from "@/features/library/state/shell-state";
import type { Save } from "@/features/saves/types";

const ROW = 64;
const PREVIEW = 48;

interface ListViewProps {
  saves: ReadonlyArray<Save>;
  onEndReached?: () => void;
}

export function ListView({ saves, onEndReached }: ListViewProps) {
  const width = useDeferredGridWidth();
  const { items, totalHeight } = useMemo(
    () =>
      packList(
        saves.map((save) => save.id),
        width,
        ROW,
        PREVIEW,
      ),
    [saves, width],
  );

  return (
    <>
      <ListHeader />
      <SavePackedGrid
        layout="list"
        items={items}
        totalHeight={totalHeight}
        onEndReached={onEndReached}
      />
    </>
  );
}
