import { useSyncExternalStore } from "react";

export type DisplayPrefKey = "name" | "date" | "fileCount" | "sourceBadge";

export interface DisplayPrefs {
  name: boolean;
  date: boolean;
  fileCount: boolean;
  sourceBadge: boolean;
}

const STORAGE_KEYS: Record<DisplayPrefKey, string> = {
  name: "pond.display.name",
  date: "pond.display.date",
  fileCount: "pond.display.fileCount",
  sourceBadge: "pond.display.sourceBadge",
};

const DEFAULTS: DisplayPrefs = {
  name: true,
  date: true,
  fileCount: true,
  sourceBadge: false,
};

function readKey(key: DisplayPrefKey): boolean {
  if (typeof window === "undefined") return DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (raw == null) return DEFAULTS[key];
    return raw === "1";
  } catch {
    return DEFAULTS[key];
  }
}

function readAll(): DisplayPrefs {
  return {
    name: readKey("name"),
    date: readKey("date"),
    fileCount: readKey("fileCount"),
    sourceBadge: readKey("sourceBadge"),
  };
}

const listeners = new Set<() => void>();
let snapshot: DisplayPrefs = readAll();

function emit() {
  snapshot = readAll();
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): DisplayPrefs {
  return snapshot;
}

export function setDisplayPref(key: DisplayPrefKey, value: boolean): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEYS[key], value ? "1" : "0");
    } catch {
      /* storage denied — keep the in-memory snapshot in sync anyway */
    }
  }
  emit();
}

export function useDisplayPrefs(): DisplayPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
