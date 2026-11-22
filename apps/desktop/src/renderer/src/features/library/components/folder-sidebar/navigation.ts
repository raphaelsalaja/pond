import {
  libraryChrome,
  type SidebarPanel,
} from "@/features/library/state/library-chrome";
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

/** Rail pages are code-split, so a cold click would swap the sidebar before the page chunk arrives. */
export async function preloadLibraryNav(nav: LibraryNav): Promise<void> {
  await getAppRouter()?.preloadRoute({ to: pathForLibraryNav(nav) });
}

export function showSidebarPanel(panel: SidebarPanel): void {
  libraryChrome.setSidebarPanel(panel);
  if (!libraryChrome.getState().sidebarOpen) libraryChrome.toggleSidebar();
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
