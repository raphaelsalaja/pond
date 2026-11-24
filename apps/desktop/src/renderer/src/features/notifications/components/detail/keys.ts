import type { KeyboardEvent } from "react";
import { isEditableTarget } from "@/shared/lib/editable-target";

/** J, K and Escape on any Inbox page; returns true when it handled the key. */
export function navigationKey(
  event: KeyboardEvent<HTMLElement>,
  onStep: (by: 1 | -1) => void,
  onClose: () => void,
): boolean {
  switch (event.code) {
    case "KeyJ":
    case "ArrowDown":
      onStep(1);
      return true;
    case "KeyK":
    case "ArrowUp":
      onStep(-1);
      return true;
    case "Escape":
      onClose();
      return true;
    default:
      return false;
  }
}

export function ignoresKey(event: KeyboardEvent<HTMLElement>): boolean {
  return (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    isEditableTarget(event.target)
  );
}
