import { matches } from "@pond/schema/filters/match";
import { isEmptyQuery, type Query } from "@pond/schema/filters/types";
import { useMemo } from "react";
import type { Save } from "./types";

/**
 * Apply a filter query (and optional sort) against an in-memory list
 * of saves.
 *
 * The renderer holds the entire `Save` set in the Object Pool, so
 * client-side filtering is the cheapest path to a reactive UI:
 * mutations via the executor land in the pool, the chip bar updates
 * the URL → query, and this hook re-runs the JS evaluator over the
 * current snapshot. No IPC round-trip per keystroke.
 *
 * The `saves.find` IPC handler in main runs the same AST through
 * `to-sql.ts` for parity tests, future pagination, and headless
 * jobs that don't have the pool loaded. We keep both impls in sync
 * by routing through the same comparator semantics.
 *
 * Returns the input list unchanged for empty queries when the sort
 * also matches pool order (`savedAt desc`) so callers can skip an
 * extra `.filter()` / `.sort()` pass when the toolbar is at default.
 */

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
    // Default sort matches the pool's `snapshot()` order (savedAt
    // desc), so the unsorted path stays free for the common case.
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
      // Saves with no size sink to the bottom in either direction so
      // the meaningful rows always cluster at the top.
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
