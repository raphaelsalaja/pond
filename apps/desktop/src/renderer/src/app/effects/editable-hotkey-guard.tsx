import { useLayoutEffect } from "react";
import { appHotkeyBlockedByEditable } from "@/shared/lib/editable-target";

export function EditableHotkeyGuard() {
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!appHotkeyBlockedByEditable(event)) return;
      event.stopImmediatePropagation();
    };
    /** The root element bubbles after React's field handlers and before TanStack hotkeys on document. */
    const root = document.documentElement;
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
