"use client";

import { createContext, use } from "react";

export type Theme = "light" | "dark";

export type ThemePreference = Theme | "system";

interface ThemeValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeValue>({
  theme: "light",
  preference: "system",
  setPreference: () => {},
});

export function useTheme(): ThemeValue {
  return use(ThemeContext);
}
