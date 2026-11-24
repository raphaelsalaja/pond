import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/** Matches `--ds-radius-xs`, the corner cards used before it was a setting. */
export const LIBRARY_SAVE_RADIUS = 4;
export const LIBRARY_SAVE_RADIUS_MAX = 24;

const RADIUS_KEY = "pond.cardRadius";

function clamp(radius: number): number {
  return Math.min(LIBRARY_SAVE_RADIUS_MAX, Math.max(0, Math.round(radius)));
}

function readRadius(): number {
  if (!globalThis.window) return LIBRARY_SAVE_RADIUS;
  try {
    const raw = window.localStorage.getItem(RADIUS_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return LIBRARY_SAVE_RADIUS;
    return clamp(parsed);
  } catch {
    return LIBRARY_SAVE_RADIUS;
  }
}

const store = new Store(readRadius());

export function useLibrarySaveRadius(): number {
  return useSelector(store, (radius) => radius);
}

export function setLibrarySaveRadius(radius: number): void {
  const next = clamp(radius);
  if (globalThis.window) {
    try {
      window.localStorage.setItem(RADIUS_KEY, String(next));
    } catch {}
  }
  store.setState(() => next);
}
