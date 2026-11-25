import { useState } from "react";

/** Shows viewer media once it can paint, then keeps it shown for that source so a later reload never blanks it. */
export function useMediaReveal(ready: boolean, source: string): boolean {
  const [shownSource, setShownSource] = useState<string | null>(null);
  const shown = shownSource === source || ready;
  if (shown && shownSource !== source) setShownSource(source);
  return shown;
}
