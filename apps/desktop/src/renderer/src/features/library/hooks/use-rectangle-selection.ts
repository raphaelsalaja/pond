import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  clearSaveSelection,
  isLibraryBackgroundTarget,
} from "@/features/saves";
import {
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { findScrollParent } from "@/shared/lib/dom";

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function useRectangleSelection() {
  const [rectangle, setRectangle] = useState<Rectangle | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !isLibraryBackgroundTarget(event.target)) {
      return;
    }
    const grid = event.currentTarget.querySelector<HTMLElement>(
      "[data-save-collection]",
    );
    if (!grid) {
      return;
    }
    const bounds = grid.getBoundingClientRect();
    const parent = findScrollParent(grid);
    if (
      !parent ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return;
    }
    cancelRef.current?.();
    const original = [...selection.snapshot()];
    const originalCursor = selection.getCursor();
    const originalAnchor = selection.getAnchor();
    const originalPrimary = primarySelection.get();
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const key = resultNavigation.key();
    const start = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    let pointer = { x: event.clientX, y: event.clientY };
    let dragging = false;
    let stopped = false;
    let frame = 0;
    const pointerId = event.pointerId;
    grid.focus({ preventScroll: true });
    if (!additive) {
      clearSaveSelection();
    }

    const update = () => {
      if (stopped) {
        return;
      }
      if (key !== resultNavigation.key()) {
        finish(false);
        return;
      }
      const rect = grid.getBoundingClientRect();
      const end = { x: pointer.x - rect.left, y: pointer.y - rect.top };
      dragging ||= Math.hypot(end.x - start.x, end.y - start.y) >= 4;
      if (!dragging) {
        return;
      }
      const area = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
      const hits = resultNavigation.intersecting(area);
      selection.set(additive ? new Set([...original, ...hits]) : hits);
      const cursor = hits.at(-1) ?? (additive ? originalCursor : null);
      selection.setCursor(cursor);
      primarySelection.set(cursor);
      if (hits[0]) {
        selection.setAnchor(hits[0]);
      }
      const viewport = parent.getBoundingClientRect();
      const top = Math.max(viewport.top, area.top + rect.top);
      const bottom = Math.min(
        viewport.bottom,
        area.top + rect.top + area.height,
      );
      setRectangle({
        left: area.left + rect.left,
        top,
        width: area.width,
        height: Math.max(0, bottom - top),
      });
    };
    const tick = () => {
      if (stopped) {
        return;
      }
      if (dragging) {
        const viewport = parent.getBoundingClientRect();
        const edge = 36;
        const velocity =
          pointer.y < viewport.top + edge
            ? -Math.min(24, (viewport.top + edge - pointer.y) / 3)
            : pointer.y > viewport.bottom - edge
              ? Math.min(24, (pointer.y - viewport.bottom + edge) / 3)
              : 0;
        if (velocity) {
          parent.scrollTop += velocity;
          update();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) {
        return;
      }
      pointer = { x: next.clientX, y: next.clientY };
      update();
    };
    const finish = (restore: boolean) => {
      if (stopped) {
        return;
      }
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", keydown, true);
      cancelRef.current = null;
      setRectangle(null);
      if (restore && key === resultNavigation.key()) {
        selection.clear();
        selection.set(original);
        selection.setCursor(originalCursor);
        if (originalAnchor) {
          selection.setAnchor(originalAnchor);
        }
        primarySelection.set(originalPrimary);
      }
    };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) {
        finish(false);
      }
    };
    const cancel = () => finish(true);
    const keydown = (next: KeyboardEvent) => {
      if (next.key !== "Escape") {
        return;
      }
      next.preventDefault();
      next.stopImmediatePropagation();
      cancel();
    };
    cancelRef.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", keydown, true);
    frame = requestAnimationFrame(tick);
    event.preventDefault();
  };
  return { rectangle, onPointerDown };
}
