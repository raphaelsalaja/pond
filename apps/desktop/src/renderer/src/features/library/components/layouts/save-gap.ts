import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { LIBRARY_SAVE_GAP } from "./packing";

const GAP_MIN = 0;
const GAP_KEY = "pond.itemGap";

function readGap(): number {
  if (!globalThis.window) {
    return LIBRARY_SAVE_GAP;
  }
  try {
    const raw = window.localStorage.getItem(GAP_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return LIBRARY_SAVE_GAP;
    }
    return Math.max(GAP_MIN, parsed);
  } catch {
    return LIBRARY_SAVE_GAP;
  }
}

const store = new Store(readGap());

export function useLibrarySaveGap(): number {
  return useSelector(store, (gap) => gap);
}

export function setLibrarySaveGap(gap: number): void {
  const next = Math.max(GAP_MIN, Math.round(gap));
  if (globalThis.window) {
    try {
      window.localStorage.setItem(GAP_KEY, String(next));
    } catch {
      /** Storage can be full or blocked; the in-memory gap still applies. */
    }
  }
  store.setState(() => next);
}
