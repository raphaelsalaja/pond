import { createContext, useLayoutEffect, useMemo, useRef } from "react";

const MAX_POSITIONS = 100;

interface ScrollPosition {
  top: number;
  anchorId?: string;
  anchorOffset?: number;
}

export interface ScrollAnchor {
  id: string;
  offset: number;
}

const positions = new Map<string, ScrollPosition>();

export function rememberScroll(key: string, top: number): void {
  const current = positions.get(key);
  positions.delete(key);
  positions.set(key, { ...current, top: Math.max(0, top) });
  prune();
}

export function rememberScrollAnchor(
  key: string,
  top: number,
  anchor: ScrollAnchor,
): void {
  positions.delete(key);
  positions.set(key, {
    top: Math.max(0, top),
    anchorId: anchor.id,
    anchorOffset: Math.max(0, anchor.offset),
  });
  prune();
}

function prune(): void {
  while (positions.size > MAX_POSITIONS) {
    const oldest = positions.keys().next().value;
    if (oldest === undefined) break;
    positions.delete(oldest);
  }
}

export function recallScroll(key: string): number {
  return positions.get(key)?.top ?? 0;
}

export function recallScrollAnchor(key: string): ScrollAnchor | null {
  const position = positions.get(key);
  if (!position?.anchorId || position.anchorOffset === undefined) {
    return null;
  }
  return { id: position.anchorId, offset: position.anchorOffset };
}

export interface ScrollRestorationScope {
  key: string;
  ref: React.RefObject<HTMLElement | null>;
}

export const ScrollRestorationContext =
  createContext<ScrollRestorationScope | null>(null);

export function useScrollRestoration(key: string) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    let restoring = recallScroll(key) > 0;
    let restoreFrame = 0;
    let restoreAttempts = 0;
    const restore = () => {
      restoreFrame = 0;
      const target = recallScroll(key);
      if (target <= 0) {
        restoring = false;
        delete element.dataset.restoringScroll;
        return;
      }
      element.dataset.restoringScroll = "";
      element.scrollTop = target;
      restoreAttempts += 1;
      const reached = Math.abs(element.scrollTop - target) <= 1;
      if (!reached && restoreAttempts < 30) {
        restoreFrame = requestAnimationFrame(restore);
        return;
      }
      restoring = false;
      delete element.dataset.restoringScroll;
    };
    if (restoring) restore();

    let saveFrame = 0;
    const save = () => {
      if (restoring) return;
      if (saveFrame !== 0) return;
      saveFrame = requestAnimationFrame(() => {
        saveFrame = 0;
        rememberScroll(key, element.scrollTop);
      });
    };
    element.addEventListener("scroll", save, { passive: true });

    return () => {
      if (restoreFrame !== 0) cancelAnimationFrame(restoreFrame);
      if (saveFrame !== 0) cancelAnimationFrame(saveFrame);
      element.removeEventListener("scroll", save);
      delete element.dataset.restoringScroll;
      if (element.closest("[data-suppressed]") !== null) {
        return;
      }
      rememberScroll(key, restoring ? recallScroll(key) : element.scrollTop);
    };
  }, [key]);

  return useMemo<ScrollRestorationScope>(() => ({ key, ref }), [key]);
}
