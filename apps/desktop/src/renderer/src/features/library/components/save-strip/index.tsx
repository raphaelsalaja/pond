import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { LibraryGrid } from "@/features/library/components/layouts/grid";
import { packGrid } from "@/features/library/components/layouts/packing";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { chromeHeightFor } from "@/features/library/lib/library-chrome";
import {
  LibraryGridProvider,
  SaveCard,
  useDisplayPrefs,
  useItemInfo,
} from "@/features/saves";
import { openSave } from "@/features/saves/navigation";

interface SaveStripProps {
  ids: ReadonlyArray<string>;
  columns?: number;
  label: string;
}

const callbacks = {
  onClick: (id: string) => openSave(id),
  onAuxClick: () => undefined,
  onDoubleClick: (id: string) => openSave(id),
};

/** Fixed rows of Library grid cards for surfaces outside the Library view. */
export function SaveStrip({ ids, columns = 4, label }: SaveStripProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);
  const gap = useLibrarySaveGap();
  const prefs = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const chromeHeight = chromeHeightFor(prefs, itemInfo.visible);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { items, totalHeight } = useMemo(() => {
    const columnWidth = Math.floor((width - gap * (columns - 1)) / columns);
    return packGrid(ids, width, columnWidth, gap, chromeHeight);
  }, [ids, width, columns, gap, chromeHeight]);

  return (
    <LibraryGridProvider callbacks={callbacks} multiSelectActive={false}>
      <LibraryGrid.Grid
        ref={ref}
        layout="grid"
        role="listbox"
        aria-label={label}
        style={{ height: totalHeight }}
      >
        {items.map((item, index) => (
          <SaveCard
            key={item.id}
            id={item.id}
            view="grid"
            position={index + 1}
            total={items.length}
            slot={{
              width: item.width,
              height: item.height,
              previewHeight: item.mediaHeight,
              top: item.top,
              left: item.left,
            }}
          />
        ))}
      </LibraryGrid.Grid>
    </LibraryGridProvider>
  );
}
