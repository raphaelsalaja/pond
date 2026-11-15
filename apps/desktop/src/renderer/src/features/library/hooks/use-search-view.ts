import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  type SearchView,
  searchViewFor,
} from "@/features/library/lib/search-view";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { listPathForLocation, parseMode } from "@/features/saves";

export function useSearchView(): SearchView {
  const nav = useLibraryNav();
  const mode = useRouterState({
    select: (state) =>
      parseMode(listPathForLocation(state.location.pathname)) ?? "library",
  });
  return useMemo(() => searchViewFor(mode, nav), [mode, nav]);
}
