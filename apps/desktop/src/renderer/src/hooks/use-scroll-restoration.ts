import { createContext, useLayoutEffect, useMemo, useRef } from "react";
import { pondScopedKey } from "@/lib/pond-scope";

const STORAGE_KEY = pondScopedKey("pond.scrollPositions:v1");
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
let hydrated = false;
let persistHandle: ReturnType<typeof setTimeout> | null = null;

function hydratePositions(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<[unknown, unknown]>;
    if (!Array.isArray(entries)) return;
    for (const entry of entries.slice(-MAX_POSITIONS)) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      /** v1 initially stored a bare number; accept it while upgrading to identity anchors. */
      if (typeof entry[1] === "number" && Number.isFinite(entry[1])) {
        positions.set(entry[0], { top: Math.max(0, entry[1]) });
        continue;
      }
      if (!entry[1] || typeof entry[1] !== "object") continue;
      const value = entry[1] as Partial<ScrollPosition>;
      if (typeof value.top !== "number" || !Number.isFinite(value.top)) {
        continue;
      }
      const position: ScrollPosition = { top: Math.max(0, value.top) };
      if (
        typeof value.anchorId === "string" &&
        typeof value.anchorOffset === "number" &&
        Number.isFinite(value.anchorOffset)
      ) {
        position.anchorId = value.anchorId;
        position.anchorOffset = Math.max(0, value.anchorOffset);
      }
      positions.set(entry[0], position);
    }
  } catch {
    /** Storage can be unavailable in tests or restricted renderers; memory restoration still works. */
  }
}

function writePositions(): void {
  if (persistHandle !== null) {
    clearTimeout(persistHandle);
    persistHandle = null;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(positions.entries()).slice(-MAX_POSITIONS)),
    );
  } catch {
    /** Storage denied; retain the in-memory behavior for this renderer session. */
  }
}

function schedulePersist(): void {
  if (persistHandle !== null) clearTimeout(persistHandle);
  persistHandle = setTimeout(writePositions, 200);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", writePositions);
}

export function rememberScroll(key: string, top: number): void {
  hydratePositions();
  const current = positions.get(key);
  /** Refresh insertion order so pruning retains the most recently viewed routes. */
  positions.delete(key);
  positions.set(key, { ...current, top: Math.max(0, top) });
  pruneAndPersist();
}

export function rememberScrollAnchor(
  key: string,
  top: number,
  anchor: ScrollAnchor,
): void {
  hydratePositions();
  positions.delete(key);
  positions.set(key, {
    top: Math.max(0, top),
    anchorId: anchor.id,
    anchorOffset: Math.max(0, anchor.offset),
  });
  pruneAndPersist();
}

function pruneAndPersist(): void {
  while (positions.size > MAX_POSITIONS) {
    const oldest = positions.keys().next().value;
    if (typeof oldest !== "string") break;
    positions.delete(oldest);
  }
  schedulePersist();
}

export function recallScroll(key: string): number {
  hydratePositions();
  return positions.get(key)?.top ?? 0;
}

export function recallScrollAnchor(key: string): ScrollAnchor | null {
  hydratePositions();
  const position = positions.get(key);
  if (!position?.anchorId || position.anchorOffset == null) return null;
  return { id: position.anchorId, offset: position.anchorOffset };
}

export interface ScrollRestorationScope {
  key: string;
  ref: React.RefObject<HTMLElement | null>;
}

export const ScrollRestorationContext =
  createContext<ScrollRestorationScope | null>(null);

/** Remembers an element scroller while its tab/route is unmounted, then restores after the packed grid has laid out. */
export function useScrollRestoration(key: string) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const target = recallScroll(key);
    let restoring = target > 0;
    let restoreFrame = 0;
    let restoreAttempts = 0;
    const restore = () => {
      restoreFrame = 0;
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
    if (restoring) restoreFrame = requestAnimationFrame(restore);

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
      /** Preserve the intended target if navigation interrupts restoration before layout becomes tall enough. */
      rememberScroll(key, restoring ? target : element.scrollTop);
    };
  }, [key]);

  return useMemo<ScrollRestorationScope>(() => ({ key, ref }), [key]);
}
