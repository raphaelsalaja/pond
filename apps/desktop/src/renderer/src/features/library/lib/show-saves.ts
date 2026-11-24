import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { selectSaves } from "@/features/saves";
import { resultNavigation } from "@/features/saves/navigation";
import { getAppRouter } from "@/shared/lib/app-router";
import { type LibraryNav, pathForLibraryNav } from "@/shared/lib/library-nav";

/** Whether the grid already shows `nav` as `selectLibraryNav` would leave it, so no new results will be published. */
function alreadyShowing(nav: LibraryNav): boolean {
  const location = getAppRouter()?.latestLocation;
  if (!location || location.pathname !== pathForLibraryNav(nav)) return false;
  const { save: _save, ...search }: Record<string, unknown> = location.search;
  if (nav.kind === "all") return search.scope === undefined;
  return Object.keys(search).length === 0;
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
