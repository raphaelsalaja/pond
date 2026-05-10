import { useSyncExternalStore } from "react";

/**
 * Linear-style recents — keyed by save id, not URL. A save you've
 * opened recently belongs in this list whether you got there from the
 * grid, command palette, deep link, or inbox; the source URL doesn't
 * matter, only the entity does.
 *
 * Persisted to localStorage so it survives restarts. Capped to 20 to
 * stay scannable.
 */

const STORAGE_KEY = "pond.recents.saves";
const RECENTS_CAP = 20;

export interface RecentEntry {
  saveId: string;
  visitedAt: number;
}

const listeners = new Set<() => void>();

let state: RecentEntry[] = hydrate();

function hydrate(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as RecentEntry).saveId === "string" &&
        typeof (item as RecentEntry).visitedAt === "number"
      ) {
        out.push({
          saveId: (item as RecentEntry).saveId,
          visitedAt: (item as RecentEntry).visitedAt,
        });
      }
    }
    return out.slice(0, RECENTS_CAP);
  } catch {
    return [];
  }
}

function persist(next: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage may be denied (private mode, quota) — ignore */
  }
}

function emit(): void {
  for (const cb of listeners) cb();
}

/**
 * Push a save to the front of the recents list. If the save is
 * already there, it bubbles up; otherwise it joins the head and the
 * tail entry past `RECENTS_CAP` falls off.
 */
export function recordVisit(saveId: string): void {
  const top = state[0];
  if (top?.saveId === saveId) {
    state = [{ saveId, visitedAt: Date.now() }, ...state.slice(1)];
  } else {
    state = [
      { saveId, visitedAt: Date.now() },
      ...state.filter((e) => e.saveId !== saveId),
    ].slice(0, RECENTS_CAP);
  }
  persist(state);
  emit();
}

export function clearRecents(): void {
  state = [];
  persist(state);
  emit();
}

export function getSnapshot(): RecentEntry[] {
  return state;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useRecents(): RecentEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
