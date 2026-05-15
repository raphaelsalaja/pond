import { matches } from "@pond/schema/filters/match";
import { isEmptyQuery, type Query } from "@pond/schema/filters/types";
import { useMemo } from "react";
import type { Save } from "./types";

export type SortKey = "savedAt" | "title" | "fileSize";
export type SortDir = "asc" | "desc";

export interface FilterOptions {
  sortKey?: SortKey;
  sortDir?: SortDir;
}

export function useFilteredSaves(
  saves: Save[],
  query: Query | null,
  opts?: FilterOptions,
): Save[] {
  const sortKey = opts?.sortKey ?? "savedAt";
  const sortDir = opts?.sortDir ?? "desc";
  return useMemo(() => {
    const filtered =
      !query || isEmptyQuery(query)
        ? saves
        : saves.filter((s) => matches(query, s));
    if (sortKey === "savedAt" && sortDir === "desc") return filtered;
    return sortSaves(filtered, sortKey, sortDir);
  }, [saves, query, sortKey, sortDir]);
}

function sortSaves(saves: Save[], key: SortKey, dir: SortDir): Save[] {
  const sign = dir === "asc" ? 1 : -1;
  const out = saves.slice();
  out.sort((a, b) => sign * cmp(a, b, key));
  return out;
}

function cmp(a: Save, b: Save, key: SortKey): number {
  switch (key) {
    case "savedAt":
      return savedAtMs(a) - savedAtMs(b);
    case "title":
      return titleFor(a).localeCompare(titleFor(b));
    case "fileSize": {
      const sa = sizeFor(a);
      const sb = sizeFor(b);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb;
    }
  }
}

function savedAtMs(s: Save): number {
  const t = new Date(s.savedAt).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function titleFor(s: Save): string {
  return (s.title ?? s.url ?? "").toLowerCase();
}

function sizeFor(s: Save): number | null {
  const cover = s.files[s.coverIndex ?? 0];
  return cover?.size ?? s.fileSize ?? null;
}
