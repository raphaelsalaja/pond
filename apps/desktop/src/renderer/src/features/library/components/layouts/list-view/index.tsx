import { useMemo } from "react";
import type { ReactNode } from "react";
import { ListHeader } from "@/features/library/components/layouts/list-header";
import { SavePackedGrid } from "@/features/library/components/layouts/packed-grid";
import { packList } from "@/features/library/components/layouts/packing";
import { useDeferredGridWidth } from "@/features/library/state/shell-state";
import type { Save } from "@/features/saves/types";

const ROW = 64;
const PREVIEW = 48;

interface ListViewProps {
  saves: ReadonlyArray<Save>;
  lead?: ReadonlyArray<Save>;
  divider?: ReactNode;
  onEndReached?: () => void;
}

export function ListView({
  saves,
  lead,
  divider,
  onEndReached,
}: ListViewProps) {
  const width = useDeferredGridWidth();
  const packs = useMemo(() => {
    const pack = (list: ReadonlyArray<Save>) =>
      packList(
        list.map((save) => save.id),
        width,
        ROW,
        PREVIEW,
      );
    return { rest: pack(saves), lead: lead?.length ? pack(lead) : undefined };
  }, [saves, lead, width]);

  return (
    <>
      <ListHeader />
      <SavePackedGrid
        layout="list"
        items={packs.rest.items}
        totalHeight={packs.rest.totalHeight}
        lead={packs.lead}
        divider={divider}
        onEndReached={onEndReached}
      />
    </>
  );
}
