import { useState } from "react";

function sameIds<T extends { id: string }>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): boolean {
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b || a.id !== b.id) {
      return false;
    }
  }
  return true;
}

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

export function useStableById<T extends { id: string }>(
  next: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const [stable, setStable] = useState(next);
  if (stable !== next && !sameIds(stable, next)) {
    setStable(next);
    return next;
  }
  return stable;
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
