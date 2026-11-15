import { primarySelection, selection } from "@/features/saves/state/selection";

export function selectOnlySave(id: string): void {
  selection.setPicking(false);
  selection.setCursor(id);
  selection.set([id]);
  selection.setAnchor(id);
  primarySelection.set(id);
}

function rememberSave(id: string): void {
  selection.setAnchor(id);
  primarySelection.set(id);
}

export function clearSaveSelection(): void {
  selection.clear();
  primarySelection.set(null);
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
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-save-id]")) return false;
  if (target.closest("[role='dialog']")) return false;
  if (target.closest("button, a, input, textarea, [contenteditable='true']")) {
    return false;
  }
  return target.closest("[data-library-grid]") != null;
}
