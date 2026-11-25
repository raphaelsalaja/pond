import type { KeyboardEvent } from "react";

export function stopMenuKeys(event: KeyboardEvent) {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}
