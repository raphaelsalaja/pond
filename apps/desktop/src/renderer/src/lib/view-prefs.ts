export type ViewPrefKey = "view" | "sort" | "dir" | "inspector";

const STORAGE_KEYS: Record<ViewPrefKey, string> = {
  view: "pond.view",
  sort: "pond.sort",
  dir: "pond.dir",
  inspector: "pond.inspector",
};

export function readViewPref(key: ViewPrefKey): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEYS[key]);
  } catch {
    return null;
  }
}

export function writeViewPref(key: ViewPrefKey, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    /* storage denied — fall back to URL-only behaviour */
  }
}
