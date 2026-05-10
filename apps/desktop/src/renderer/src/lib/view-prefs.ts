/**
 * Persisted "what I last picked" memory for the saves grid view —
 * layout, sort key, sort direction. Mirrors writes the LayoutPopover /
 * list view already make to the URL (`?view`, `?sort`, `?dir`).
 *
 * Why both URL and localStorage:
 *  - The URL stays canonical at runtime so deep links and the back/
 *    forward stack continue to work — `?view=grid&sort=title` is still
 *    a meaningful shareable link.
 *  - On a fresh app launch (or any navigation that lands on a bare
 *    URL without these params), readers fall back to the saved value
 *    here instead of the hardcoded "waterfall / savedAt / desc"
 *    defaults — so the grid opens the way the user last left it.
 *
 * Display switches (name / date / file count / source badge) live in
 * `display-prefs.ts`; zoom lives in the `useZoom` hook in the header
 * toolbar. Both follow the same "pond.*" localStorage convention.
 */

export type ViewPrefKey = "view" | "sort" | "dir";

const STORAGE_KEYS: Record<ViewPrefKey, string> = {
  view: "pond.view",
  sort: "pond.sort",
  dir: "pond.dir",
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
