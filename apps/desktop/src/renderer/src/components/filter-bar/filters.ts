import type { Save } from "../../pool/types";

/**
 * URL-based filter state. Each filter id maps to its own search-param
 * key so filter combos are deep-linkable + shareable. The header
 * toolbar lives outside `<SavesView>`, so URL state is the only sane
 * way to bridge them — `useSearchParams()` from React Router on both
 * sides keeps the wiring trivial.
 *
 * Multi-value filters serialize as comma-separated lists (`tag=a,b`);
 * range filters use `<id>_min` / `<id>_max` (size, dimensions) or
 * `<id>_from` / `<id>_to` (dates). Single-value filters use the bare
 * id key.
 *
 * Adding a new filter:
 *   1. Add an id to `FilterId`
 *   2. Add a `serialize` / `deserialize` / `match` triple below
 *   3. Wire it into the registry in `filter-defs.tsx`
 */

export type FilterId =
  | "color"
  | "tags"
  | "folder"
  | "shape"
  | "rating"
  | "type"
  | "dimensions"
  | "duration"
  | "size"
  | "note"
  | "url"
  | "date_imported"
  | "date_modified";

export type Shape = "portrait" | "landscape" | "square";
export type MediaTypeFilter =
  | "image"
  | "video"
  | "link"
  | "article"
  | "twitter"
  | "instagram"
  | "pinterest"
  | "arena"
  | "cosmos"
  | "tiktok"
  | "youtube";

/** Bucket size constants used by the dimensions and size filters.
 *
 * `min` / `max` are written as plain `number | undefined` so consumers
 * can do a single `if (def.min !== undefined && x < def.min)` check
 * without TypeScript narrowing them away by id. The `as const`
 * version has the same shape but every entry only declares the keys
 * it sets, which makes the union exhaustive on `id` but unhelpful for
 * the bucket math. */
export interface RangeBucket<Id extends string> {
  id: Id;
  label: string;
  min?: number;
  max?: number;
}

export type SizeBucketId = "small" | "medium" | "large" | "huge";
export const SIZE_BUCKETS: ReadonlyArray<RangeBucket<SizeBucketId>> = [
  { id: "small", label: "Small (< 1 MB)", max: 1_000_000 },
  {
    id: "medium",
    label: "Medium (1\u201310 MB)",
    min: 1_000_000,
    max: 10_000_000,
  },
  {
    id: "large",
    label: "Large (10\u2013100 MB)",
    min: 10_000_000,
    max: 100_000_000,
  },
  { id: "huge", label: "Huge (> 100 MB)", min: 100_000_000 },
];

export type DimensionBucketId = "small" | "medium" | "large" | "huge";
export const DIMENSION_BUCKETS: ReadonlyArray<RangeBucket<DimensionBucketId>> =
  [
    { id: "small", label: "Small (< 800 px)", max: 800 },
    { id: "medium", label: "Medium (800\u20131600 px)", min: 800, max: 1600 },
    { id: "large", label: "Large (1600\u20133000 px)", min: 1600, max: 3000 },
    { id: "huge", label: "Huge (> 3000 px)", min: 3000 },
  ];

export const DATE_PRESETS = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 90 days", days: 90 },
  { id: "year", label: "Last year", days: 365 },
] as const;
export type DatePresetId = (typeof DATE_PRESETS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Per-filter parsed value shapes.                                     */
/* ------------------------------------------------------------------ */

export interface FilterValues {
  color: string[]; // hex without leading `#`, e.g. ["ff0000"]
  tags: string[];
  folder: string | null; // placeholder
  shape: Shape | null;
  rating: number | null; // placeholder
  type: MediaTypeFilter[]; // matches `mediaType` OR `source`
  dimensions: DimensionBucketId | null;
  duration: string | null; // placeholder
  size: SizeBucketId | null;
  note: "with" | "without" | null;
  url: string; // contains text
  date_imported: DatePresetId | null;
  date_modified: DatePresetId | null;
}

export const EMPTY_FILTERS: FilterValues = {
  color: [],
  tags: [],
  folder: null,
  shape: null,
  rating: null,
  type: [],
  dimensions: null,
  duration: null,
  size: null,
  note: null,
  url: "",
  date_imported: null,
  date_modified: null,
};

/* ------------------------------------------------------------------ */
/* Parse / serialize URL search params.                                */
/* ------------------------------------------------------------------ */

export function readFilters(params: URLSearchParams): FilterValues {
  const get = (k: string): string | null => params.get(k);
  const list = (k: string): string[] => {
    const v = params.get(k);
    if (!v) return [];
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const ratingRaw = get("rating");
  const rating = ratingRaw ? Number.parseInt(ratingRaw, 10) : NaN;

  return {
    color: list("color"),
    tags: list("tag"),
    folder: get("folder"),
    shape: parseShape(get("shape")),
    rating: Number.isFinite(rating) ? rating : null,
    type: list("type") as MediaTypeFilter[],
    dimensions: get("dim") as DimensionBucketId | null,
    duration: get("duration"),
    size: get("size") as SizeBucketId | null,
    note: parseNote(get("note")),
    url: get("url") ?? "",
    date_imported: get("imported") as DatePresetId | null,
    date_modified: get("modified") as DatePresetId | null,
  };
}

export function writeFilter<K extends FilterId>(
  params: URLSearchParams,
  id: K,
  next: FilterValues[K],
): URLSearchParams {
  const p = new URLSearchParams(params);
  switch (id) {
    case "color":
      writeList(p, "color", next as string[]);
      break;
    case "tags":
      writeList(p, "tag", next as string[]);
      break;
    case "folder":
      writeScalar(p, "folder", next as string | null);
      break;
    case "shape":
      writeScalar(p, "shape", next as Shape | null);
      break;
    case "rating":
      writeScalar(p, "rating", next === null ? null : String(next as number));
      break;
    case "type":
      writeList(p, "type", next as string[]);
      break;
    case "dimensions":
      writeScalar(p, "dim", next as string | null);
      break;
    case "duration":
      writeScalar(p, "duration", next as string | null);
      break;
    case "size":
      writeScalar(p, "size", next as string | null);
      break;
    case "note":
      writeScalar(p, "note", next as string | null);
      break;
    case "url": {
      const value = (next as string) ?? "";
      writeScalar(p, "url", value.trim() || null);
      break;
    }
    case "date_imported":
      writeScalar(p, "imported", next as string | null);
      break;
    case "date_modified":
      writeScalar(p, "modified", next as string | null);
      break;
  }
  return p;
}

export function clearFilter(
  params: URLSearchParams,
  id: FilterId,
): URLSearchParams {
  const empty = EMPTY_FILTERS[id];
  return writeFilter(params, id, empty);
}

function writeList(p: URLSearchParams, key: string, value: string[]) {
  if (!value.length) {
    p.delete(key);
    return;
  }
  p.set(key, value.join(","));
}

function writeScalar(
  p: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    p.delete(key);
    return;
  }
  p.set(key, value);
}

function parseShape(v: string | null): Shape | null {
  if (v === "portrait" || v === "landscape" || v === "square") return v;
  return null;
}

function parseNote(v: string | null): "with" | "without" | null {
  if (v === "with" || v === "without") return v;
  return null;
}

/* ------------------------------------------------------------------ */
/* Predicates — apply parsed filters to the in-memory pool.            */
/* ------------------------------------------------------------------ */

export function applyFilters(saves: Save[], f: FilterValues): Save[] {
  return saves.filter((s) => matchesAll(s, f));
}

function matchesAll(s: Save, f: FilterValues): boolean {
  if (f.color.length && !matchColor(s, f.color)) return false;
  if (f.tags.length && !matchTags(s, f.tags)) return false;
  if (f.shape && !matchShape(s, f.shape)) return false;
  if (f.type.length && !matchType(s, f.type)) return false;
  if (f.dimensions && !matchDimensions(s, f.dimensions)) return false;
  if (f.size && !matchSize(s, f.size)) return false;
  if (f.note && !matchNote(s, f.note)) return false;
  if (f.url && !matchUrl(s, f.url)) return false;
  if (f.date_imported && !matchDate(s.savedAt, f.date_imported)) return false;
  const modIso = s.embeddingUpdatedAt ?? s.createdAt ?? s.savedAt;
  if (f.date_modified && !matchDate(modIso, f.date_modified)) return false;
  return true;
}

function matchColor(s: Save, wanted: string[]): boolean {
  const cols = s.dominantColors ?? [];
  if (!cols.length) return false;
  return cols.some((c) =>
    wanted.some((w) => isColorClose(stripHash(c.hex), w)),
  );
}

function stripHash(hex: string): string {
  return hex.replace(/^#/, "").toLowerCase();
}

/**
 * Cheap perceptual closeness: split the hex into RGB channels and
 * compare via Manhattan distance. ~48 covers "near" without being
 * a strict equality check, which would never match noisy AI-extracted
 * dominant colours.
 */
function isColorClose(a: string, b: string): boolean {
  const ar = Number.parseInt(a.slice(0, 2), 16);
  const ag = Number.parseInt(a.slice(2, 4), 16);
  const ab = Number.parseInt(a.slice(4, 6), 16);
  const br = Number.parseInt(b.slice(0, 2), 16);
  const bg = Number.parseInt(b.slice(2, 4), 16);
  const bb = Number.parseInt(b.slice(4, 6), 16);
  if ([ar, ag, ab, br, bg, bb].some((n) => !Number.isFinite(n))) return false;
  const dist = Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
  return dist < 96;
}

function matchTags(s: Save, wanted: string[]): boolean {
  const have = new Set([...s.tags, ...s.aiTags].map((t) => t.toLowerCase()));
  return wanted.every((t) => have.has(t.toLowerCase()));
}

function matchShape(s: Save, wanted: Shape): boolean {
  const w = s.width ?? null;
  const h = s.height ?? null;
  if (!w || !h) return false;
  const ratio = w / h;
  if (wanted === "square") return ratio > 0.9 && ratio < 1.1;
  if (wanted === "portrait") return ratio < 0.9;
  return ratio > 1.1;
}

function matchType(s: Save, wanted: MediaTypeFilter[]): boolean {
  const candidates = new Set<string>();
  if (s.mediaType) candidates.add(s.mediaType);
  if (s.source) candidates.add(s.source.toLowerCase());
  return wanted.some((w) => candidates.has(w));
}

function matchDimensions(s: Save, bucket: DimensionBucketId): boolean {
  const longest = Math.max(s.width ?? 0, s.height ?? 0);
  if (!longest) return false;
  const def = DIMENSION_BUCKETS.find((b) => b.id === bucket);
  if (!def) return false;
  if (def.min !== undefined && longest < def.min) return false;
  if (def.max !== undefined && longest > def.max) return false;
  return true;
}

function matchSize(s: Save, bucket: SizeBucketId): boolean {
  const size = s.fileSize ?? 0;
  if (!size) return false;
  const def = SIZE_BUCKETS.find((b) => b.id === bucket);
  if (!def) return false;
  if (def.min !== undefined && size < def.min) return false;
  if (def.max !== undefined && size > def.max) return false;
  return true;
}

function matchNote(s: Save, mode: "with" | "without"): boolean {
  const has = Boolean((s.notes ?? s.description ?? "").trim());
  return mode === "with" ? has : !has;
}

function matchUrl(s: Save, needle: string): boolean {
  return s.url.toLowerCase().includes(needle.toLowerCase());
}

function matchDate(
  iso: string | null | undefined,
  preset: DatePresetId,
): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  const def = DATE_PRESETS.find((p) => p.id === preset);
  if (!def) return false;
  return Date.now() - ts <= def.days * 86_400_000;
}

/* ------------------------------------------------------------------ */
/* Active-filter helpers — used by the chip bar to decide which        */
/* chips to render.                                                    */
/* ------------------------------------------------------------------ */

export function activeFilterIds(f: FilterValues): FilterId[] {
  const out: FilterId[] = [];
  if (f.color.length) out.push("color");
  if (f.tags.length) out.push("tags");
  if (f.folder) out.push("folder");
  if (f.shape) out.push("shape");
  if (f.rating !== null) out.push("rating");
  if (f.type.length) out.push("type");
  if (f.dimensions) out.push("dimensions");
  if (f.duration) out.push("duration");
  if (f.size) out.push("size");
  if (f.note) out.push("note");
  if (f.url) out.push("url");
  if (f.date_imported) out.push("date_imported");
  if (f.date_modified) out.push("date_modified");
  return out;
}

export function isActive<K extends FilterId>(
  values: FilterValues,
  id: K,
): boolean {
  const v = values[id];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.length > 0;
  return v !== null && v !== undefined;
}
