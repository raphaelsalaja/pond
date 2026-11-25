type ViewPrefKey =
  | "seed"
  | "view"
  | "sort"
  | "dir"
  | "inspector"
  | "sidebar"
  | "filters"
  | "filterRules"
  | "filterFields"
  | "filterOverlays"
  | "filterLayout"
  | "subfolders";

const STORAGE_KEYS = {
  seed: "pond.randomSeed",
  view: "pond.view",
  sort: "pond.sort",
  dir: "pond.dir",
  inspector: "pond.inspector",
  sidebar: "pond.sidebar",
  filters: "pond.filters",
  filterRules: "pond.filterRules",
  filterFields: "pond.filterFields",
  filterOverlays: "pond.filterOverlays",
  filterLayout: "pond.filterLayout",
  subfolders: "pond.subfolders",
} satisfies Record<ViewPrefKey, string>;

export function readViewPref(key: ViewPrefKey): string | null {
  if (!globalThis.window) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEYS[key]);
  } catch {
    return null;
  }
}

export function writeViewPref(key: ViewPrefKey, value: string): void {
  if (!globalThis.window) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    /** Storage can be full or blocked; the in-memory state still applies. */
  }
}

export type LayoutValue = "waterfall" | "grid" | "justified" | "list";

const LAYOUT_CYCLE: ReadonlyArray<LayoutValue> = [
  "waterfall",
  "grid",
  "justified",
  "list",
];

export function isLayoutValue(value: string): value is LayoutValue {
  return LAYOUT_CYCLE.some((layout) => layout === value);
}

export function nextLayout(current: LayoutValue): LayoutValue {
  const idx = LAYOUT_CYCLE.indexOf(current);
  return LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length] ?? "waterfall";
}
