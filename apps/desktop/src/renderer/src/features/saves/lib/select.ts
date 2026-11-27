import { isElement } from "@pond/ui/dom";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";

export function selectOnlySave(id: string): void {
  selection.setPicking(false);
  selection.setCursor(id);
  selection.set([id]);
  selection.setAnchor(id);
  primarySelection.set(id);
}

/** Selects exactly `ids`, puts the cursor on the first, and scrolls the grid to it. */
export function selectSaves(ids: ReadonlyArray<string>): void {
  const [first] = ids;
  if (!first) return;
  selection.setPicking(false);
  selection.setCursor(first);
  selection.set(ids);
  selection.setAnchor(first);
  primarySelection.set(first);
  void resultNavigation.reveal(first);
}

function rememberSave(id: string): void {
  selection.setAnchor(id);
  primarySelection.set(id);
}

export function clearSaveSelection(): void {
  selection.clear();
  primarySelection.set(null);
}

function dropDepartedSaves(gone: ReadonlySet<string>): void {
  selection.remove(gone);
  const primary = primarySelection.get();
  if (primary === null || !gone.has(primary)) return;
  const anchor = selection.getAnchor();
  primarySelection.set(
    (anchor && selection.has(anchor) ? anchor : null) ??
      selection.snapshot()[0] ??
      null,
  );
}

interface CollectionResults {
  key: string;
  ids: ReadonlyArray<string>;
  settled: boolean;
}

/** Deselects Saves that leave the results, so the inspector never shows a Save the grid no longer has. */
export function createSelectionReconciler(): (
  results: CollectionResults,
) => void {
  let last: Omit<CollectionResults, "settled"> | null = null;
  return ({ key, ids, settled }) => {
    /** A refetch, or a new query still showing the previous page, must not read as Saves leaving. */
    if (!settled) return;
    const previous = last;
    last = { key, ids };
    if (previous?.key !== key) return;
    const remaining = new Set(ids);
    const gone = new Set(previous.ids.filter((id) => !remaining.has(id)));
    if (gone.size > 0) dropDepartedSaves(gone);
  };
}

export function clickSave(
  id: string,
  keys: { meta: boolean; shift: boolean },
  filteredIds: ReadonlyArray<string>,
): void {
  selection.setCursor(id);
  if (keys.meta) {
    selection.toggle(id);
    if (selection.has(id)) {
      rememberSave(id);
      return;
    }
    if (primarySelection.get() !== id) return;
    const anchor = selection.getAnchor();
    const fallback =
      (anchor && selection.has(anchor) ? anchor : null) ??
      selection.snapshot()[0] ??
      null;
    primarySelection.set(fallback);
    return;
  }

  if (keys.shift) {
    const anchor = selection.getAnchor() ?? id;
    selection.setRange(filteredIds, anchor, id);
    selection.setAnchor(anchor);
    primarySelection.set(id);
    return;
  }

  selectOnlySave(id);
}

/** A card's selection circle: toggles like Mod-click without a modifier, and Shift still selects a range. */
export function pickSave(
  id: string,
  keys: { shift: boolean },
  filteredIds: ReadonlyArray<string>,
): void {
  clickSave(id, { meta: !keys.shift, shift: keys.shift }, filteredIds);
  selection.setPicking(selection.size() > 0);
}

export function isLibraryBackgroundTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }
  if (target.closest("[data-save-id]")) {
    return false;
  }
  if (target.closest("[role='dialog']")) {
    return false;
  }
  if (target.closest("button, a, input, textarea, [contenteditable='true']")) {
    return false;
  }
  return (
    target.closest("[data-library-grid], [data-library-grid-viewport]") !== null
  );
}
