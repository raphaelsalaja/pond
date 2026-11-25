import { isHTMLElement } from "@pond/ui/dom";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { isEditableTarget } from "@/shared/lib/editable-target";

/** Toasts are non-modal dialogs and never take keys from the surface that has focus. */
const OVERLAY =
  "[role='dialog']:not([aria-modal='false']), [role='alertdialog'], [role='menu']";

/** Widgets that move with arrow keys themselves. A plain button, like a viewer tool, leaves them to the open Save. */
const ARROW_WIDGET =
  "input, [role='slider'], [role='radiogroup'], [role='tablist'], [role='listbox']";

export function controlKeepsKey(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!isHTMLElement(target)) {
    return false;
  }
  if (event.key === "Enter" || event.key === " ") {
    return target.closest("button") !== null;
  }
  return target.closest(ARROW_WIDGET) !== null;
}

export function collectionOwnsKeyboard(): boolean {
  const active = document.activeElement;
  if (document.querySelector(OVERLAY)) {
    return false;
  }
  return (
    isHTMLElement(active) &&
    !isEditableTarget(active) &&
    active.closest("[data-save-collection]") !== null
  );
}

export function saveOwnsKeyboard(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    isEditableTarget(event.target)
  ) {
    return false;
  }
  const active = document.activeElement;
  if (!isHTMLElement(active) || isEditableTarget(active)) {
    return false;
  }
  const overlay = active.closest(OVERLAY);
  if (overlay && !overlay.matches("[data-quick-preview]")) {
    return false;
  }
  if (!overlay && document.querySelector(OVERLAY)) {
    return false;
  }
  const inspector = active.closest<HTMLElement>("[data-save-inspector]");
  if (inspector) {
    const id = inspector.dataset.saveInspector;
    return (
      id === primarySelection.get() &&
      selection.snapshot().every((selected) => selected === id)
    );
  }
  /** Focus falls back to body when the focused control unmounts; the open save still owns its keys. */
  if (active === document.body)
    return document.querySelector("[data-save-details], [data-inbox]") != null;
  return (
    active.closest(
      "[data-save-collection], [data-save-details], [data-quick-preview], [data-inbox]",
    ) != null
  );
}
