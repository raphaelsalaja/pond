import { useMemo } from "react";
import {
  type PackedItem,
  type PackResult,
  SavePackedGrid,
} from "@/components/library/layouts/packed-grid";
import type { Save } from "@/lib/types";
import { chromeHeightFor } from "@/lib/ui/library-chrome";
import { aspectFor, useAspectVersion } from "@/stores/aspect";
import { useDisplayPrefs } from "@/stores/display-prefs";
import { useGridWidth } from "@/stores/shell-state";

const TARGET_ROW_HEIGHT = 180;

function packRows(
  saves: ReadonlyArray<Save>,
  containerWidth: number,
  targetHeight: number,
  gap: number,
  chromeHeight: number,
): PackResult {
  if (containerWidth <= 0 || saves.length === 0) {
    return { items: [], totalHeight: 0 };
  }

  const items: PackedItem[] = [];
  let current: Save[] = [];
  let aspectSum = 0;
  let cursorTop = 0;

  const flushRow = (height: number) => {
    let cursorLeft = 0;
    for (const save of current) {
      const width = aspectFor(save) * height;
      items.push({
        id: save.id,
        width,
        height,
        top: cursorTop,
        left: cursorLeft,
      });
      cursorLeft += width + gap;
    }
    /** Without chromeHeight the next row overlaps the meta block. */
    cursorTop += height + chromeHeight + gap;
    current = [];
    aspectSum = 0;
  };

  for (const save of saves) {
    const aspect = aspectFor(save);
    current.push(save);
    aspectSum += aspect;
    const naturalWidth = aspectSum * targetHeight + gap * (current.length - 1);
    if (naturalWidth >= containerWidth) {
      const available = containerWidth - gap * (current.length - 1);
      flushRow(available / aspectSum);
    }
  }
  /** The last partial row keeps target height so cards trail off rather than over-stretch. */
  if (current.length > 0) flushRow(targetHeight);
  const totalHeight = Math.max(0, cursorTop - gap);
  return { items, totalHeight };
}

interface JustifiedViewProps {
  saves: ReadonlyArray<Save>;
  targetHeight?: number;
  onEndReached?: () => void;
}

export function JustifiedView({
  saves,
  targetHeight = TARGET_ROW_HEIGHT,
  onEndReached,
}: JustifiedViewProps) {
  const width = useGridWidth();
  const prefs = useDisplayPrefs();
  const chromeHeight = chromeHeightFor(prefs);
  const itemGap = 16;
  const aspectVersion = useAspectVersion();

  const { items, totalHeight } = useMemo(() => {
    void aspectVersion;
    return packRows(saves, width, targetHeight, itemGap, chromeHeight);
  }, [saves, width, targetHeight, chromeHeight, aspectVersion]);

  return (
    <SavePackedGrid
      layout="justified"
      items={items}
      totalHeight={totalHeight}
      onEndReached={onEndReached}
    />
  );
}
