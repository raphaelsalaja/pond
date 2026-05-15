import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Library } from "@/components/library";
import type { Save } from "@/pool/types";
import { aspectFor } from "./aspect";

const TARGET_ROW_HEIGHT = 180;
const ITEM_GAP = 12;

interface PackedItem {
  save: Save;
  width: number;
  height: number;
}

function packRows(
  saves: Save[],
  containerWidth: number,
  targetHeight: number,
): PackedItem[] {
  if (containerWidth <= 0 || saves.length === 0) return [];
  const out: PackedItem[] = [];
  let current: Save[] = [];
  let aspectSum = 0;
  const flushRow = (height: number) => {
    for (const sv of current) {
      const w = aspectFor(sv) * height;
      out.push({ save: sv, width: w, height });
    }
    current = [];
    aspectSum = 0;
  };
  for (const s of saves) {
    const a = aspectFor(s);
    current.push(s);
    aspectSum += a;
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
  return out;
}

export interface JustifiedViewProps {
  saves: Save[];
  renderCard: (save: Save, width: number, height: number) => React.ReactNode;
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
    setWidth(ref.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    let raf = 0;
    let pending: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      pending = last.contentRect.width;
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

  const packed = useMemo(
    () => packRows(saves, width, targetHeight),
    [saves, width, targetHeight],
  );

  return (
    <Library.Grid ref={ref} layout="justified" multiSelect={multiSelectActive}>
      {packed.map(({ save, width: w, height: h }) => renderCard(save, w, h))}
    </Library.Grid>
  );
}
