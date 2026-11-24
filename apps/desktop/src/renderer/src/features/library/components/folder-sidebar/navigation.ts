import { libraryChrome } from "@/features/library/state/library-chrome";
import type { SidebarPanel } from "@/features/library/state/library-chrome";
import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { hrefWithSearch } from "@/shared/lib/route-search";

/** Each collection opens unfiltered; All keeps the search, so a search can widen to every Save. */
export function selectLibraryNav(nav: LibraryNav): void {
  const router = getAppRouter();
  if (!router) {
    return;
  }
  const path = pathForLibraryNav(nav);
  const href =
    nav.kind === "all"
      ? (hrefWithSearch({ save: undefined, scope: undefined }, path) ?? path)
      : path;
  if (href !== router.latestLocation.href) {
    getAppHistory()?.push(href);
  }
}

/** Rail pages are code-split, so a cold click would swap the sidebar before the page chunk arrives. */
export async function preloadLibraryNav(nav: LibraryNav): Promise<void> {
  await getAppRouter()?.preloadRoute({ to: pathForLibraryNav(nav) });
}

export function showSidebarPanel(panel: SidebarPanel): void {
  libraryChrome.setSidebarPanel(panel);
  if (!libraryChrome.getState().sidebarOpen) {
    libraryChrome.toggleSidebar();
  }
}
