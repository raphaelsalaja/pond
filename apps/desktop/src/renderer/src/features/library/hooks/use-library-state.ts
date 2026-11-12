import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useEffectiveFilterQuery,
  useLayout,
  useSearchText,
} from "@/features/library/state/view-store";
import type { ViewMode } from "@/features/library/types";
import {
  listPathForLocation,
  parseMode,
  type SaveListMode,
} from "@/features/saves";
import { useBootReady, useSaves } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { useStableStrings } from "../../../shared/hooks/use-stable-array";
import { useNarrowedSaves } from "./use-narrowed-saves";

interface LibraryState {
  bootReady: boolean;
  totalSaves: number;
  filtered: ReadonlyArray<Save>;
  filteredIds: ReadonlyArray<string>;
  mode: SaveListMode;
  sourceFilter: string;
  hasActiveSearch: boolean;
  hasActiveFilter: boolean;
  searchText: string;
  viewMode: ViewMode;
  unknown: boolean;
  paging: ReturnType<typeof useNarrowedSaves>;
}

export function useLibraryState(): LibraryState {
  const saves = useSaves();
  const bootReady = useBootReady();
  const location = useLocation();
  const layout = useLayout();
  const searchText = useSearchText();
  const filterQuery = useEffectiveFilterQuery();

  const parentBase = listPathForLocation(location.pathname);
  const recognized = parseMode(parentBase);
  const mode: SaveListMode = recognized ?? "library";
  const unknown = recognized === null;

  const sourceFilter = "";
  const hasActiveSearch = searchText.trim().length > 0;
  const hasActiveFilter = filterQuery.rules.length > 0;

  const viewMode: ViewMode = layout;

  const paging = useNarrowedSaves(mode, sourceFilter);
  const filtered = paging.filtered;
  const filteredIdsFresh = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const filteredIds = useStableStrings(filteredIdsFresh);

  return {
    bootReady,
    totalSaves: saves.length,
    filtered,
    filteredIds,
    mode,
    sourceFilter,
    hasActiveSearch,
    hasActiveFilter,
    searchText,
    viewMode,
    unknown,
    paging,
  };
}
