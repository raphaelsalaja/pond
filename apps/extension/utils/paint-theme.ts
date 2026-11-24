import { buildThemeTokens } from "@pond/theme/tokens";
import type { ThemeVars } from "./theme";
import type { ThemePreference } from "./types";

/** The Library's colors when Pond shared them and the preference allows, otherwise a fixed or system mode. */
export interface Appearance {
  theme: ThemeVars | null;
  mode: "light" | "dark" | null;
}

export function resolveAppearance(
  preference: ThemePreference,
  libraryTheme: ThemeVars | null,
): Appearance {
  if (preference === "light" || preference === "dark") {
    return { theme: null, mode: preference };
  }
  return {
    theme: preference === "library" ? libraryTheme : null,
    mode: null,
  };
}

const painted = new WeakMap<HTMLElement, Array<string>>();

export function paintTheme(target: HTMLElement, appearance: Appearance): void {
  const { theme, mode } = appearance;
  for (const name of painted.get(target) ?? []) {
    target.style.removeProperty(name);
  }
  painted.delete(target);
  if (!theme) {
    const dark =
      mode === "dark" ||
      (mode === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    target.setAttribute("data-theme", dark ? "dark" : "light");
    target.style.colorScheme = dark ? "dark" : "light";
    return;
  }
  const gamut = window.matchMedia("(color-gamut: p3)").matches ? "p3" : "srgb";
  const built = buildThemeTokens(theme, gamut);
  for (const [name, value] of Object.entries(built.tokens)) {
    target.style.setProperty(name, value);
  }
  painted.set(target, Object.keys(built.tokens));
  target.setAttribute("data-theme", built.mode);
  target.style.colorScheme = built.mode;
}
