import { useState } from "react";

function sameStrings(
  prev: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean {
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) {
      return false;
    }
  }
  return true;
}

export function useStableStrings(
  next: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const [stable, setStable] = useState(next);
  if (stable !== next && !sameStrings(stable, next)) {
    setStable(next);
    return next;
  }
  return stable;
}
