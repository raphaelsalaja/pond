import { readQuery } from "@pond/schema/filters/url";
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useRecents } from "@/components/recents";
import { readViewPref } from "@/lib/view-prefs";
import { useBootReady, useSaves } from "@/pool/hooks";
import { useSearchResults } from "@/pool/search";
import type { Save } from "@/pool/types";
import { useFilteredSaves } from "@/pool/use-filtered-saves";
import type { ViewMode } from "./layout-switcher";

export type SavesMode =
  | "library"
  | "source"
  | "untagged"
  | "recents"
  | "random";

export interface SavesData {
  bootReady: boolean;
  totalSaves: number;
  filtered: Save[];
  filteredIds: string[];
  sourceFilter: string;
  selectedId: string | null;
  viewMode: ViewMode;
}

export function useSavesData(mode: SavesMode): SavesData {
  const saves = useSaves();
  const bootReady = useBootReady();
  const params = useParams<{ source?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const query = useMemo(() => readQuery(searchParams), [searchParams]);
  const q = searchParams.get("q") ?? "";

  const sourceFilter = mode === "source" ? (params.source ?? "") : "";
  const selectedId = params.id ?? null;
  const recents = useRecents();
  const recentsOrder = useMemo(() => {
    if (mode !== "recents") return null;
    const map = new Map<string, number>();
    for (let i = 0; i < recents.length; i++) {
      const entry = recents[i];
      if (entry) map.set(entry.saveId, i);
    }
    return map;
  }, [mode, recents]);

  const randomSeed = useMemo(() => Math.random().toString(36).slice(2), []);
  const viewMode = (searchParams.get("view") ??
    readViewPref("view") ??
    "waterfall") as ViewMode;

  const search = useSearchResults(q);

  const narrowed = useMemo(() => {
    const base = search.results ?? saves;
    const filteredList = base.filter((save) => {
      if (save.deletedAt) return false;
      // Non-complete saves (ingesting / failed) live behind the
      // ProcessingButton dialog, not in the grid. Keep them out of every
      // mode so a fresh sync or stuck failure can't flood the view with
      // placeholder / "Failed" cards.
      if (save.status !== "complete") return false;
      if (sourceFilter && save.source.toLowerCase() !== sourceFilter) {
        return false;
      }
      if (mode === "untagged" && save.tags.length > 0) return false;
      if (mode === "recents" && !recentsOrder?.has(save.id)) return false;
      return true;
    });

    if (mode === "recents" && recentsOrder) {
      return filteredList.sort(
        (a, b) =>
          (recentsOrder.get(a.id) ?? Infinity) -
          (recentsOrder.get(b.id) ?? Infinity),
      );
    }

    if (mode === "random") {
      return filteredList.sort(
        (a, b) =>
          hashShuffleKey(a.id, randomSeed) - hashShuffleKey(b.id, randomSeed),
      );
    }

    return filteredList;
  }, [saves, search.results, sourceFilter, mode, recentsOrder, randomSeed]);

  const sortOpts = useMemo(() => {
    if (mode === "recents" || mode === "random") return undefined;
    const rawSort =
      searchParams.get("sort") ?? readViewPref("sort") ?? "savedAt";
    const sortKey: "savedAt" | "title" | "fileSize" =
      rawSort === "title" || rawSort === "fileSize" ? rawSort : "savedAt";
    const rawDir = searchParams.get("dir") ?? readViewPref("dir");
    const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
    return { sortKey, sortDir };
  }, [mode, searchParams]);

  const filtered = useFilteredSaves(narrowed, query, sortOpts);
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);

  return {
    bootReady,
    totalSaves: saves.length,
    filtered,
    filteredIds,
    sourceFilter,
    selectedId,
    viewMode,
  };
}

function hashShuffleKey(id: string, seed: string): number {
  const s = `${id}:${seed}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
