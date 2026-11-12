import { libraryChrome } from "@/features/library/state/library-chrome";
import { resetFilters } from "@/features/library/state/view-store";
import { getAppRouter } from "@/shared/lib/app-router";
import {
  isLibraryCollectionPath,
  type LibraryNav,
  pathForLibraryNav,
} from "@/shared/lib/library-nav";

function goToLibraryPath(path: string): void {
  getAppRouter()?.history.push(path);
}

export function selectLibraryNav(nav: LibraryNav): void {
  if (nav.kind !== "all") resetFilters();
  libraryChrome.setNav(nav);
  goToLibraryPath(pathForLibraryNav(nav));
}

/** Walks remembered library navigation and keeps the route on that collection. */
export function restoreLibraryNav(nav: LibraryNav): void {
  libraryChrome.setNav(nav);
  const router = getAppRouter();
  const pathname = router?.state.location.pathname;
  if (!router || !pathname || !isLibraryCollectionPath(pathname)) return;
  const next = pathForLibraryNav(nav);
  if (next !== pathname) router.history.replace(next);
}
