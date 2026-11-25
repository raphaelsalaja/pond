import { isElement } from "@pond/ui/dom";
import { useEffect, useEffectEvent } from "react";

/** Listens in the capture phase so the page's own Escape handlers don't swallow the cancel. */
export function useEscape(onEscape: () => void): void {
  const handle = useEffectEvent(onEscape);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const [target] = event.composedPath();
      /** An open combobox closes its own popup first. */
      if (
        isElement(target) &&
        target.getAttribute("aria-expanded") === "true"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handle();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
}
