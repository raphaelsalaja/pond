import { useSyncExternalStore } from "react";

const KEY = "pond.filterRecents";
const CAP = 20;
const listeners = new Set<() => void>();

let cache: string[] = read();

function read(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(0, CAP);
  } catch {
    return [];
  }
}

function write(next: string[]): void {
  cache = next.slice(0, CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage might be denied — fail silently, keep in-memory cache */
  }
  for (const cb of listeners) cb();
}

export function pushRecent(key: string): void {
  if (!key) return;
  const next = [key, ...cache.filter((k) => k !== key)];
  write(next);
}

export function useRecents(): readonly string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => cache,
    () => cache,
  );
}
