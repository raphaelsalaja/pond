import { readQuery } from "@pond/schema/filters/url";
import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useRecents } from "@/components/recents";
import { readViewPref } from "@/lib/view-prefs";
import { useSaves } from "@/pool/hooks";
import { useSearchResults } from "@/pool/search";
import type { Save } from "@/pool/types";
import { useFilteredSaves } from "@/pool/use-filtered-saves";

export type ListMode =
  | "library"
  | "source"
  | "untagged"
  | "recents"
  | "random"
  | "trash";

export interface ListContext {
  mode: ListMode;
  parentLabel: string;
  parentTo: string;
  buildDetailPath: (id: string) => string;
  ids: string[];
  total: number;
  index: number;
  prevId: string | null;
  nextId: string | null;
}

interface ListContextOptions {
  activeId: string | null;
}

export function useListContext({ activeId }: ListContextOptions): ListContext {
  const saves = useSaves();
  const recents = useRecents();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const path = location.pathname;
  const parentBase =
    path.replace(/\/detail\/[^/]+\/?$/, "").replace(/\/+$/, "") || "/";

  const mode = parseMode(parentBase);
  const sourceFilter = mode === "source" ? extractSource(parentBase) : "";

  const q = searchParams.get("q") ?? "";
  const search = useSearchResults(q);
  const query = useMemo(() => readQuery(searchParams), [searchParams]);

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

  const narrowed = useMemo(() => {
    const base = mode === "trash" ? saves : (search.results ?? saves);
    const filteredList = base.filter((save) => {
      if (mode === "trash") return Boolean(save.deletedAt);
      if (save.deletedAt) return false;
      if (sourceFilter && save.source.toLowerCase() !== sourceFilter) {
        return false;
      }
      if (mode === "untagged" && save.tags.length > 0) return false;
      if (mode === "recents" && !recentsOrder?.has(save.id)) return false;
      return true;
    });

    if (mode === "trash") {
      return filteredList.sort((a, b) => deletedAtMs(b) - deletedAtMs(a));
    }

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
  }, [saves, search.results, mode, sourceFilter, recentsOrder, randomSeed]);

  const sortOpts = useMemo(() => {
    if (mode === "recents" || mode === "random" || mode === "trash") {
      return undefined;
    }
    const rawSort =
      searchParams.get("sort") ?? readViewPref("sort") ?? "savedAt";
    const sortKey: "savedAt" | "title" | "fileSize" =
      rawSort === "title" || rawSort === "fileSize" ? rawSort : "savedAt";
    const rawDir = searchParams.get("dir") ?? readViewPref("dir");
    const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
    return { sortKey, sortDir };
  }, [mode, searchParams]);

  const filtered = useFilteredSaves(
    mode === "trash" ? narrowed : narrowed,
    mode === "trash" ? null : query,
    sortOpts,
  );

  return useMemo(() => {
    const ids = filtered.map((s) => s.id);
    const index = activeId ? ids.indexOf(activeId) : -1;
    const prevId = index > 0 ? (ids[index - 1] ?? null) : null;
    const nextId =
      index >= 0 && index < ids.length - 1 ? (ids[index + 1] ?? null) : null;

    const parentLabel = labelForMode(mode, sourceFilter);
    const queryString = searchParams.toString();
    const parentTo = queryString ? `${parentBase}?${queryString}` : parentBase;

    const buildDetailPath = (id: string) => {
      const tail =
        parentBase === "/" ? `/detail/${id}` : `${parentBase}/detail/${id}`;
      return queryString ? `${tail}?${queryString}` : tail;
    };

    return {
      mode,
      parentLabel,
      parentTo,
      buildDetailPath,
      ids,
      total: ids.length,
      index,
      prevId,
      nextId,
    };
  }, [filtered, activeId, mode, sourceFilter, searchParams, parentBase]);
}

function parseMode(parentBase: string): ListMode {
  if (parentBase === "/" || parentBase === "") return "library";
  if (parentBase.startsWith("/source/")) return "source";
  if (parentBase === "/untagged") return "untagged";
  if (parentBase === "/recents") return "recents";
  if (parentBase === "/random") return "random";
  if (parentBase === "/trash") return "trash";
  return "library";
}

function extractSource(parentBase: string): string {
  const match = /^\/source\/([^/]+)/.exec(parentBase);
  return match?.[1]?.toLowerCase() ?? "";
}

function labelForMode(mode: ListMode, sourceFilter: string): string {
  switch (mode) {
    case "source":
      return sourceFilter ? capitalise(sourceFilter) : "Source";
    case "untagged":
      return "Untagged";
    case "recents":
      return "Recents";
    case "random":
      return "Random";
    case "trash":
      return "Trash";
    default:
      return "All Saves";
  }
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]?.toUpperCase() + s.slice(1);
}

function deletedAtMs(save: Save): number {
  if (!save.deletedAt) return 0;
  const t = new Date(save.deletedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function hashShuffleKey(id: string, seed: string): number {
  const s = `${id}:${seed}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
