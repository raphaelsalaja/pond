import { queryIsFullySqlSupported } from "@pond/schema/filters";
import { matches } from "@pond/schema/filters/match";
import { isEmptyQuery, type Query } from "@pond/schema/filters/types";
import { useEffect, useMemo, useState } from "react";
import { ensureSaves } from "@/lib/save/ensure-saves";
import type { Save } from "@/lib/types";
import { hydrateFullPool } from "@/stores/bootstrap";

export type SortKey =
  | "savedAt"
  | "createdAt"
  | "publishedAt"
  | "title"
  | "tagName"
  | "tagCount"
  | "duration"
  | "fileSize"
  | "fileCount"
  | "width"
  | "height"
  | "dimensions"
  | "aspectRatio"
  | "creator"
  | "source"
  | "type";
export type SortDir = "asc" | "desc";

const SORT_KEYS: readonly SortKey[] = [
  "savedAt",
  "createdAt",
  "publishedAt",
  "title",
  "tagName",
  "tagCount",
  "duration",
  "fileSize",
  "fileCount",
  "width",
  "height",
  "dimensions",
  "aspectRatio",
  "creator",
  "source",
  "type",
];

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

interface FilterOptions {
  sortKey?: SortKey;
  sortDir?: SortDir;
}

export function needsFullPoolHydration(
  empty: boolean,
  useSql: boolean,
  sortKey: SortKey,
  sortDir: SortDir,
): boolean {
  const isDefaultOrder = sortKey === "savedAt" && sortDir === "desc";
  return !((empty && isDefaultOrder) || (!empty && useSql));
}

export function useFilteredSaves(
  saves: ReadonlyArray<Save>,
  query: Query | null,
  opts?: FilterOptions,
): ReadonlyArray<Save> {
  const sortKey = opts?.sortKey ?? "savedAt";
  const sortDir = opts?.sortDir ?? "desc";
  const empty = !query || isEmptyQuery(query);
  const useSql = !empty && queryIsFullySqlSupported(query);

  /** Client-only projections and non-recency sorts need the complete pool, not just the current recency page. */
  useEffect(() => {
    if (!needsFullPoolHydration(empty, useSql, sortKey, sortDir)) return;
    void hydrateFullPool().catch((error) => {
      console.warn("[pond filters] full hydrate for projection failed", error);
    });
  }, [empty, useSql, sortKey, sortDir]);

  const [sqlResult, setSqlResult] = useState<{
    query: Query;
    sortKey: SortKey;
    sortDir: SortDir;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    if (!useSql || !query) {
      setSqlResult(null);
      return;
    }
    let cancelled = false;
    void window.pond
      .query("saves.query", {
        query,
        sortKey,
        sortDir,
      })
      .then(async (res) => {
        if (cancelled) return;
        const ids = (res as { ids: string[] }).ids ?? [];
        await ensureSaves(ids);
        if (cancelled) return;
        setSqlResult({ query, sortKey, sortDir, ids });
      })
      .catch(() => {
        if (!cancelled) setSqlResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [useSql, query, sortKey, sortDir]);

  const sqlIds =
    sqlResult?.query === query &&
    sqlResult.sortKey === sortKey &&
    sqlResult.sortDir === sortDir
      ? sqlResult.ids
      : null;

  return useMemo(() => {
    if (empty) {
      if (sortKey === "savedAt" && sortDir === "desc") return saves;
      return sortSaves(saves, sortKey, sortDir);
    }
    if (useSql && sqlIds) {
      return intersectSqlResults(saves, sqlIds);
    }
    if (useSql && sqlIds === null) {
      /** SQL in flight: keep prior in-memory filter so the grid doesn't flash empty. */
      const filtered = saves.filter((s) => matches(query as Query, s));
      if (sortKey === "savedAt" && sortDir === "desc") return filtered;
      return sortSaves(filtered, sortKey, sortDir);
    }
    const filtered = saves.filter((s) => matches(query as Query, s));
    if (sortKey === "savedAt" && sortDir === "desc") return filtered;
    return sortSaves(filtered, sortKey, sortDir);
  }, [saves, query, sortKey, sortDir, empty, useSql, sqlIds]);
}

/** Preserve the SQL sort order without widening a previously narrowed input (for example, FTS search hits). */
export function intersectSqlResults(
  saves: ReadonlyArray<Save>,
  sqlIds: ReadonlyArray<string>,
): Save[] {
  const byId = new Map(saves.map((save) => [save.id, save]));
  const list: Save[] = [];
  for (const id of sqlIds) {
    const save = byId.get(id);
    if (save) list.push(save);
  }
  return list;
}

export function sortSaves(
  saves: ReadonlyArray<Save>,
  key: SortKey,
  dir: SortDir,
): Save[] {
  const sign = dir === "asc" ? 1 : -1;
  const out = saves.slice();
  out.sort((a, b) => {
    const aMissing = isMissingSortValue(a, key);
    const bMissing = isMissingSortValue(b, key);
    if (aMissing || bMissing)
      return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    return sign * cmp(a, b, key);
  });
  return out;
}

function cmp(a: Save, b: Save, key: SortKey): number {
  switch (key) {
    case "savedAt":
      return savedAtMs(a) - savedAtMs(b);
    case "createdAt":
      return createdAtMs(a) - createdAtMs(b);
    case "publishedAt":
      return nullableNumber(publishedAtMs(a), publishedAtMs(b));
    case "title":
      return titleFor(a).localeCompare(titleFor(b));
    case "tagName":
      return (tagNameFor(a) ?? "").localeCompare(tagNameFor(b) ?? "");
    case "tagCount":
      return a.tags.length - b.tags.length;
    case "duration":
      return nullableNumber(durationFor(a), durationFor(b));
    case "fileSize":
      return nullableNumber(sizeFor(a), sizeFor(b));
    case "fileCount":
      return a.files.length - b.files.length;
    case "width":
      return nullableNumber(widthFor(a), widthFor(b));
    case "height":
      return nullableNumber(heightFor(a), heightFor(b));
    case "dimensions":
      return nullableNumber(areaFor(a), areaFor(b));
    case "aspectRatio":
      return nullableNumber(aspectRatioFor(a), aspectRatioFor(b));
    case "creator":
      return textFor(a.author).localeCompare(textFor(b.author));
    case "source":
      return textFor(a.source).localeCompare(textFor(b.source));
    case "type":
      return typeFor(a).localeCompare(typeFor(b));
  }
}

/** Missing values sort last regardless of direction's sign convention. */
function nullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function savedAtMs(s: Save): number {
  const t = new Date(s.savedAt).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function createdAtMs(s: Save): number {
  const t = new Date(s.createdAt).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function publishedAtMs(s: Save): number | null {
  const value = s.publishedAt;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function titleFor(s: Save): string {
  return (s.title ?? s.url ?? "").toLowerCase();
}

function textFor(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function typeFor(s: Save): string {
  return (s.mediaType ?? s.files[0]?.kind ?? "").toLowerCase();
}

function tagNameFor(s: Save): string | null {
  return s.tags.map((tag) => tag.toLowerCase()).sort()[0] ?? null;
}

function durationFor(s: Save): number | null {
  const raw = s.rawJson;
  const captureDuration = raw?.capture?.duration;
  if (typeof captureDuration === "number" && captureDuration > 0) {
    return captureDuration;
  }
  const mediaDuration = raw?.capture?.media.find(
    (media) => typeof media.durationSec === "number" && media.durationSec > 0,
  )?.durationSec;
  if (typeof mediaDuration === "number") return mediaDuration;
  const ytdlpDuration = raw?.ytdlp?.duration;
  return typeof ytdlpDuration === "number" && ytdlpDuration > 0
    ? ytdlpDuration
    : null;
}

function sizeFor(s: Save): number | null {
  const cover = s.files?.[s.coverIndex ?? 0];
  return cover?.size ?? s.fileSize ?? null;
}

function areaFor(s: Save): number | null {
  const w = widthFor(s);
  const h = heightFor(s);
  if (w == null || h == null) return null;
  return w * h;
}

function widthFor(s: Save): number | null {
  return s.files?.[s.coverIndex ?? 0]?.width ?? s.width ?? null;
}

function heightFor(s: Save): number | null {
  return s.files?.[s.coverIndex ?? 0]?.height ?? s.height ?? null;
}

function aspectRatioFor(s: Save): number | null {
  const w = widthFor(s);
  const h = heightFor(s);
  if (w == null || h == null || w <= 0 || h <= 0) return null;
  return w / h;
}

function isMissingSortValue(s: Save, key: SortKey): boolean {
  switch (key) {
    case "publishedAt":
      return publishedAtMs(s) == null;
    case "tagName":
      return tagNameFor(s) == null;
    case "duration":
      return durationFor(s) == null;
    case "fileSize":
      return sizeFor(s) == null;
    case "width":
      return widthFor(s) == null;
    case "height":
      return heightFor(s) == null;
    case "dimensions":
      return areaFor(s) == null;
    case "aspectRatio":
      return aspectRatioFor(s) == null;
    default:
      return false;
  }
}
