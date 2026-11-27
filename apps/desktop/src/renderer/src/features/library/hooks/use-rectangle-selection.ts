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

const EDGE_SCROLL_ZONE = 36;
const EDGE_SCROLL_SPEED_PER_PIXEL = 36;
const MAX_EDGE_SCROLL_SPEED = 1800;
/** A hitched frame is animation catch-up, not extra drag distance. */
const MAX_SCROLL_FRAME_MS = 50;

function edgeScrollSpeed(distance: number): number {
  return Math.min(
    MAX_EDGE_SCROLL_SPEED,
    distance * EDGE_SCROLL_SPEED_PER_PIXEL,
  );
}

export function edgeScrollStep({
  pointerY,
  viewport,
  elapsedMs,
}: {
  pointerY: number;
  viewport: { top: number; bottom: number };
  elapsedMs: number;
}): number {
  const topDistance = viewport.top + EDGE_SCROLL_ZONE - pointerY;
  const bottomDistance = pointerY - (viewport.bottom - EDGE_SCROLL_ZONE);
  const velocity =
    topDistance > 0
      ? -edgeScrollSpeed(topDistance)
      : bottomDistance > 0
        ? edgeScrollSpeed(bottomDistance)
        : 0;
  const frameMs = Math.min(MAX_SCROLL_FRAME_MS, Math.max(0, elapsedMs));
  return (velocity * frameMs) / 1000;
}

export function useRectangleSelection() {
  const [rectangle, setRectangle] = useState<Rectangle | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !isLibraryBackgroundTarget(event.target)) return;
    const grid = event.currentTarget.querySelector<HTMLElement>(
      "[data-save-collection]",
    );
    if (!grid) return;
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
    let lastFrame = performance.now();
    const pointerId = event.pointerId;
    grid.focus({ preventScroll: true });
    if (!additive) clearSaveSelection();

    const update = () => {
      if (stopped) return;
      if (key !== resultNavigation.key()) {
        finish(false);
        return;
      }
      const rect = grid.getBoundingClientRect();
      const end = { x: pointer.x - rect.left, y: pointer.y - rect.top };
      dragging ||= Math.hypot(end.x - start.x, end.y - start.y) >= 4;
      if (!dragging) return;
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
      if (hits[0]) selection.setAnchor(hits[0]);
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
    const tick = (now: number) => {
      if (stopped) return;
      const elapsedMs = now - lastFrame;
      lastFrame = now;
      if (dragging) {
        const viewport = parent.getBoundingClientRect();
        const scrollBy = edgeScrollStep({
          pointerY: pointer.y,
          viewport,
          elapsedMs,
        });
        if (scrollBy) {
          /** Global CSS makes auto scrolls smooth; instant keeps each frame's calculated step from restarting that animation. */
          parent.scrollBy({ top: scrollBy, behavior: "instant" });
          update();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      pointer = { x: next.clientX, y: next.clientY };
      update();
    };
    const finish = (restore: boolean) => {
      if (stopped) return;
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
        if (originalAnchor) selection.setAnchor(originalAnchor);
        primarySelection.set(originalPrimary);
      }
    };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) finish(false);
    };
    const cancel = () => finish(true);
    const keydown = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
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
