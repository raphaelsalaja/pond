import { useMemo } from "react";
import {
  type SearchView,
  searchViewFor,
} from "@/features/library/lib/search-view";
import { useLibraryNav } from "@/features/library/state/library-chrome";

export function useSearchView(): SearchView {
  const nav = useLibraryNav();
  return useMemo(() => searchViewFor(nav), [nav]);
}
