import { openSaveId } from "@/features/saves/lib/save-nav";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { currentRouteMeta } from "@/shared/lib/route-meta";
import { notify } from "@/shared/lib/toast";

/**
 * Whether the current route owns Save selection, so Select All, Invert and Deselect apply to it.
 * @remarks Selection stays in its store on other routes rather than being cleared, so Back to the grid brings it back.
 */
export function routeOwnsSaveSelection(): boolean {
  return currentRouteMeta()?.ownsSaveSelection ?? true;
}

/** The Saves a Save or Organize command acts on: the selection where the route owns it, otherwise the open Save. */
export function saveTargets(): Array<string> {
  if (!routeOwnsSaveSelection()) {
    const open = openSaveId();
    return open ? [open] : [];
  }
  const selected = selection.snapshot();
  if (selected.length > 0) return [...selected];
  const primary = primarySelection.get();
  return primary ? [primary] : [];
}

/** The one Save a single-Save command acts on: the primary selection where the route owns it, otherwise the open Save. */
function primarySaveTarget(): string | null {
  return routeOwnsSaveSelection() ? primarySelection.get() : openSaveId();
}

function selectSavesFirst(): void {
  notify({ id: "native-menu-selection", title: "Select Saves first" });
}

/** Like `saveTargets`, and says so when there is nothing to act on. */
export function requireSaveTargets(): Array<string> {
  const ids = saveTargets();
  if (ids.length === 0) selectSavesFirst();
  return ids;
}

/** Like `primarySaveTarget`, and says so when there is nothing to act on. */
export function requirePrimarySaveTarget(): string | null {
  const id = primarySaveTarget();
  if (id === null) selectSavesFirst();
  return id;
}
