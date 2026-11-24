import { isElement, isHTMLElement, isHTMLTag, isNode } from "@pond/ui/dom";
import { matchesShortcut } from "@/shared/lib/shortcuts";

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function asElement(target: EventTarget | null): Element | null {
  if (isElement(target)) {
    return target;
  }
  if (isNode(target)) {
    return target.parentElement;
  }
  return null;
}

function isEditableElement(element: Element): boolean {
  if (isHTMLTag(element, "input")) {
    return !NON_TEXT_INPUTS.has(element.type.toLowerCase());
  }
  if (isHTMLTag(element, "textarea") || isHTMLTag(element, "select")) {
    return true;
  }
  if (isHTMLElement(element)) {
    if (element.isContentEditable) {
      return true;
    }
    const mode = element.contentEditable?.toLowerCase();
    if (mode === "true" || mode === "plaintext-only") {
      return true;
    }
  }
  return (
    element.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox']",
    ) !== null
  );
}

export function isEditableTarget(
  target: EventTarget | null = document.activeElement,
): boolean {
  const element = asElement(target);
  return element !== null && isEditableElement(element);
}

export function eventFromEditable(event: KeyboardEvent): boolean {
  if (isEditableTarget(document.activeElement)) {
    return true;
  }
  if (isEditableTarget(event.target)) {
    return true;
  }
  return event.composedPath().some((node) => isEditableTarget(node));
}

/** Typing in a field owns unmodified keys and other chords; Search stays available unless the field already handled it. */
export function appHotkeyBlockedByEditable(event: KeyboardEvent): boolean {
  if (!eventFromEditable(event)) {
    return false;
  }
  if (event.defaultPrevented) {
    return true;
  }
  return !matchesShortcut(event, "library.search");
}

export function stopAppHotkeysFromEditable(event: {
  nativeEvent: KeyboardEvent;
  stopPropagation: () => void;
}): void {
  if (!appHotkeyBlockedByEditable(event.nativeEvent)) {
    return;
  }
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}
