"use client";

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "./theme";

export function useTokenValues<T extends HTMLElement>(
  names: readonly string[],
): [RefObject<T | null>, Readonly<Record<string, string>>] {
  const ref = useRef<T>(null);
  const { theme } = useTheme();
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: the theme flips computed values on an ancestor
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    setValues(
      Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name).trim()]),
      ),
    );
  }, [names, theme]);

  return [ref, values];
}
