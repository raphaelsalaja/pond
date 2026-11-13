import { useDeferredValue, useLayoutEffect, useState } from "react";
import {
  useSidebarOpen,
  useSidebarWidth,
} from "@/features/library/state/library-chrome";
import { observeSettledSize } from "@/shared/lib/settled-resize";

const MAIN_PADDING_INLINE = 20;
const GRID_PADDING = MAIN_PADDING_INLINE * 2;

interface PaneWidths {
  sidebarOpen: boolean;
  sidebarWidth: number;
}

interface GridMeasurement {
  occupiedWidth: number;
  width: number;
}

export function occupiedPaneWidth(panes: PaneWidths): number {
  return panes.sidebarOpen ? panes.sidebarWidth : 0;
}

export function predictGridWidth(
  measuredWidth: number,
  measuredOccupiedWidth: number,
  currentOccupiedWidth: number,
): number {
  return Math.max(
    0,
    measuredWidth + measuredOccupiedWidth - currentOccupiedWidth,
  );
}

function fallbackWidth(): number {
  if (!globalThis.window) return 0;
  return Math.max(0, window.innerWidth - 64);
}

function measuredOccupiedPaneWidth(viewport: HTMLElement): number {
  return (
    viewport
      .closest("[data-slot=window]")
      ?.querySelector<HTMLElement>("[data-slot=left]")
      ?.getBoundingClientRect().width ?? 0
  );
}

function useGridWidth(): number {
  const sidebarOpen = useSidebarOpen();
  const sidebarWidth = useSidebarWidth();
  const occupiedWidth = occupiedPaneWidth({ sidebarOpen, sidebarWidth });
  const [measurement, setMeasurement] = useState<GridMeasurement>(() => ({
    occupiedWidth,
    width: fallbackWidth(),
  }));

  useLayoutEffect(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-library-grid-viewport]",
    );
    if (!viewport) return;

    return observeSettledSize(
      viewport,
      () => {
        const next = Math.max(0, viewport.clientWidth - GRID_PADDING);
        const nextOccupiedWidth = measuredOccupiedPaneWidth(viewport);
        setMeasurement((current) =>
          current.width === next && current.occupiedWidth === nextOccupiedWidth
            ? current
            : { occupiedWidth: nextOccupiedWidth, width: next },
        );
      },
      { continuous: true },
    );
  }, []);

  return predictGridWidth(
    measurement.width,
    measurement.occupiedWidth,
    occupiedWidth,
  );
}

/** Keep width-driven card packing out of the urgent sidebar-toggle render. */
export function useDeferredGridWidth(): number {
  return useDeferredValue(useGridWidth());
}
