import { isHTMLElement, isHTMLTag } from "@pond/ui/dom";
import type { KeyboardEvent } from "react";

interface CardKeys {
  submit?: () => void;
  cancel?: () => void;
  /** Return `true` when the digit picked something, so the key stops there. */
  pick?: (index: number, card: HTMLElement) => boolean;
}

function typing(target: EventTarget) {
  return (
    isHTMLElement(target) &&
    (target.isContentEditable ||
      isHTMLTag(target, "input") ||
      isHTMLTag(target, "textarea"))
  );
}

/** Bound on the card itself, so keys only act while focus is inside it and never while typing in the composer. */
export function cardKeys({ submit, cancel, pick }: CardKeys) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) {
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && mod && submit) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape" && cancel) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (
      pick &&
      !mod &&
      !event.altKey &&
      /^[1-9]$/.test(event.key) &&
      !typing(event.target) &&
      pick(Number(event.key) - 1, event.currentTarget)
    ) {
      event.preventDefault();
    }
  };
}
