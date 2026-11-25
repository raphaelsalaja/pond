import { useDeferredValue, useLayoutEffect, useState } from "react";
import {
  useDetailsWidth,
  useSidebarWidth,
} from "@/features/library/state/library-chrome";
import { useShellLayout } from "@/features/library/state/shell-layout";
import { observeSettledSize } from "@/shared/lib/settled-resize";

const MAIN_PADDING_INLINE = 20;
const GRID_PADDING = MAIN_PADDING_INLINE * 2;

interface PaneWidths {
  sidebarOpen: boolean;
  sidebarWidth: number;
  detailsOpen?: boolean;
  detailsWidth?: number;
}

interface GridMeasurement {
  occupiedWidth: number;
  width: number;
}

export function occupiedPaneWidth(panes: PaneWidths): number {
  return (
    (panes.sidebarOpen ? panes.sidebarWidth : 0) +
    (panes.detailsOpen ? (panes.detailsWidth ?? 0) : 0)
  );
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
  const shell = viewport.closest("[data-slot=window]");
  let width = 0;
  for (const side of ["left", "right"]) {
    width +=
      shell
        ?.querySelector<HTMLElement>(
          `:scope > [data-slot=panes] > [data-slot=${side}]`,
        )
        ?.getBoundingClientRect().width ?? 0;
  }
  return width;
}

function useGridWidth(): number {
  const { leftOpen, rightOpen } = useShellLayout();
  const sidebarWidth = useSidebarWidth();
  const detailsWidth = useDetailsWidth();
  const occupiedWidth = occupiedPaneWidth({
    sidebarOpen: leftOpen,
    sidebarWidth,
    detailsOpen: rightOpen,
    detailsWidth,
  });
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

/** Keep width-driven card packing out of the urgent column-toggle render. */
export function useDeferredGridWidth(): number {
  return useDeferredValue(useGridWidth());
}
