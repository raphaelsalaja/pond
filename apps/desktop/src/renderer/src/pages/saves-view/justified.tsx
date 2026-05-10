import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Library } from "@/components/library";
import type { Save } from "@/pool/types";
import { aspectFor } from "./aspect";

/**
 * Justified gallery layout — equal row heights *within a row*, variable
 * column widths, every full row packed flush to both container edges.
 * Eagle's "Justified" mode and Google Photos' main grid use this same
 * technique.
 *
 * CSS-only flexbox can't do this on its own because it has no way to
 * choose row breaks based on each item's intrinsic aspect ratio. So we
 * run the classic greedy row-packer in JS, observe the container width
 * via `ResizeObserver`, and emit each card with its width AND its
 * media-slot height set inline. Flexbox then wraps naturally because
 * the packer guarantees each row's widths sum exactly to the
 * container width (minus gaps).
 *
 * Cost: O(n) per layout pass on mount, on every resize, and whenever
 * the input list changes — all cheap because each card is just one
 * arithmetic call.
 */

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
  /** Render each save into a card. Receives the packed width + media
   * slot height so the card can publish them to its own chrome. */
  renderCard: (save: Save, width: number, height: number) => React.ReactNode;
  multiSelectActive: boolean;
  /** Override the default target row height. */
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
    // rAF-batch so a window-resize drag doesn't fire `packRows` once
    // per RO callback (potentially multiple per frame). We coalesce
    // bursts to the next animation frame and only commit if the width
    // actually changed.
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
