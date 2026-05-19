import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Library } from "@/components/library";
import type { Save } from "@/pool/types";
import { aspectFor } from "./aspect";
import { useVisibleIndices } from "./virtual";

const TARGET_ROW_HEIGHT = 180;
const ITEM_GAP = 12;

interface PackedItem {
  save: Save;
  width: number;
  height: number;
  top: number;
  left: number;
}

interface PackResult {
  items: PackedItem[];
  totalHeight: number;
}

function packRows(
  saves: Save[],
  containerWidth: number,
  targetHeight: number,
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
    for (const s of current) {
      const width = aspectFor(s) * height;
      items.push({
        save: s,
        width,
        height,
        top: cursorTop,
        left: cursorLeft,
      });
      cursorLeft += width + ITEM_GAP;
    }
    cursorTop += height + ITEM_GAP;
    current = [];
    aspectSum = 0;
  };

  for (const save of saves) {
    const aspect = aspectFor(save);
    current.push(save);
    aspectSum += aspect;
    const naturalWidth =
      aspectSum * targetHeight + ITEM_GAP * (current.length - 1);
    if (naturalWidth >= containerWidth) {
      const available = containerWidth - ITEM_GAP * (current.length - 1);
      flushRow(available / aspectSum);
    }
  }
  /* Last partial row keeps target height; cards retain natural widths
   * and trail off rather than over-stretching. Matches Eagle. */
  if (current.length > 0) flushRow(targetHeight);
  const totalHeight = Math.max(0, cursorTop - ITEM_GAP);
  return { items, totalHeight };
}

export interface JustifiedViewProps {
  saves: Save[];
  renderCard: (
    save: Save,
    packed: { top: number; left: number; width: number; height: number },
  ) => React.ReactNode;
  multiSelectActive: boolean;
  targetHeight?: number;
}

export function JustifiedView({
  saves,
  renderCard,
  multiSelectActive,
  targetHeight = TARGET_ROW_HEIGHT,
}: JustifiedViewProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);

  /* Read the container width synchronously after layout so the very
   * first paint already shows the packed rows — avoids a one-frame
   * flash where everything piles up at width=0. */
  useLayoutEffect(() => {
    if (!ref.current) return;
    const w = ref.current.getBoundingClientRect().width;
    if (w > 0) setWidth(w);
  }, []);

  // Hidden tabs keep the component mounted via `display: none`
  // (see `App.tsx`). ResizeObserver would otherwise fire with width
  // 0 every time we leave the tab, collapsing the row layout. Hold
  // the last non-zero width across visibility changes so returning
  // to the tab doesn't trigger a full re-pack.
  useEffect(() => {
    if (!ref.current) return;
    let raf = 0;
    let pending: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      const w = last.contentRect.width;
      if (w <= 0) return;
      pending = w;
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (pending !== null) {
          const next = pending;
          pending = null;
          setWidth((prev) => (prev === next ? prev : next));
        }
      });
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  const { items, totalHeight } = useMemo(
    () => packRows(saves, width, targetHeight),
    [saves, width, targetHeight],
  );

  const style = useMemo<React.CSSProperties>(
    () => ({ height: `${totalHeight}px` }),
    [totalHeight],
  );

  const visible = useVisibleIndices(ref, items);

  return (
    <Library.Grid
      ref={ref}
      layout="justified"
      multiSelect={multiSelectActive}
      style={style}
    >
      {visible.map((i) => {
        const it = items[i];
        if (!it) return null;
        return renderCard(it.save, {
          top: it.top,
          left: it.left,
          width: it.width,
          height: it.height,
        });
      })}
    </Library.Grid>
  );
}
