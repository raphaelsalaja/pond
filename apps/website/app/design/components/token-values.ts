"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTheme } from "./theme";

export function useTokenValues<T extends HTMLElement>(
  names: ReadonlyArray<string>,
): [RefObject<T | null>, Readonly<Record<string, string>>] {
  const ref = useRef<T>(null);
  const { theme } = useTheme();
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const style = getComputedStyle(element);
    setValues(
      Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name).trim()]),
      ),
    );
  }, [names, theme]);

  return [ref, values];
}
