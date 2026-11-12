import {
  buildThemeTokens,
  type Gamut,
  type ThemeInput,
  type ThemeMode,
} from "@pond/theme/tokens";

export function displayGamut(): Gamut {
  return window.matchMedia("(color-gamut: p3)").matches ? "p3" : "srgb";
}

/** Rewriting root tokens restyles the whole document, and the boot shell and every pref change repaint the same theme. */
let painted: { key: string; mode: ThemeMode } | null = null;

export function paintTheme(input: ThemeInput, gamut: Gamut): ThemeMode {
  const { background, foreground, accent, contrast } = input;
  const key = JSON.stringify([background, foreground, accent, contrast, gamut]);
  if (painted?.key === key) return painted.mode;
  const { mode, tokens } = buildThemeTokens(input, gamut);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  painted = { key, mode };
  return mode;
}
