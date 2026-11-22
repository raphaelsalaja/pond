import { useMemo } from "react";
import {
  type SearchView,
  searchViewFor,
} from "@/features/library/lib/search-view";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { listPathForLocation, parseMode } from "@/features/saves";
import { useRouteLocation } from "@/shared/hooks/use-route-location";

export function useSearchView(): SearchView {
  const nav = useLibraryNav();
  const mode = useRouteLocation(
    (location) =>
      parseMode(listPathForLocation(location.pathname)) ?? "library",
  );
  return useMemo(() => searchViewFor(mode, nav), [mode, nav]);
}
