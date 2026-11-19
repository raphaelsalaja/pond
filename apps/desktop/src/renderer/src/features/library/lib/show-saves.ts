import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { showsLibraryGrid } from "@/features/library/lib/grid-path";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { getViewState } from "@/features/library/state/view-store";
import { getLastListPath, selectSaves } from "@/features/saves";
import { resultNavigation } from "@/features/saves/navigation";
import { getAppRouter } from "@/shared/lib/app-router";
import type { LibraryNav } from "@/shared/lib/library-nav";

function hasFilters(): boolean {
  const view = getViewState();
  return Boolean(
    view.q.trim() ||
      view.query.rules.length ||
      view.inheritedQuery.rules.length ||
      view.semanticQuery ||
      view.visualProbe,
  );
}

/** Whether the grid already shows `nav` as `selectLibraryNav` would leave it, so no new results will be published. */
function alreadyShowing(nav: LibraryNav): boolean {
  const pathname = getAppRouter()?.state.location.pathname ?? "/";
  if (!showsLibraryGrid(pathname) || getLastListPath() !== "/") return false;
  const current = libraryChrome.getState().nav;
  if (nav.kind !== "folder") return current.kind === nav.kind;
  return current.kind === "folder" && current.id === nav.id && !hasFilters();
}

/** Opens the folder an import went into, or All, and selects exactly the Saves it returned. */
export function showSavesInLibrary(
  ids: readonly string[],
  folderId?: string,
): void {
  if (ids.length === 0) return;
  const nav: LibraryNav = folderId
    ? { kind: "folder", id: folderId }
    : { kind: "all" };
  const settled = alreadyShowing(nav);
  selectLibraryNav(nav);
  selectSaves(ids);
  /** Entering the grid or a new view clears the selection and drops a pending scroll, so both repeat on its first results. */
  if (!settled) resultNavigation.onNextSource(() => selectSaves(ids));
}
