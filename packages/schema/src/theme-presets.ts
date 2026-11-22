import {
  CONTRAST_DEFAULT,
  type ThemeAppearance,
  type ThemeDef,
} from "./prefs.types";

export type ThemePresetAppearance = "light" | "dark";

export interface ThemePreset {
  id: string;
  name: string;
  appearance: ThemePresetAppearance;
  def: ThemeDef;
}

function light(
  id: string,
  name: string,
  accent: string,
  background: string,
  foreground: string,
  contrast = CONTRAST_DEFAULT,
): ThemePreset {
  return {
    id,
    name,
    appearance: "light",
    def: { accent, background, foreground, contrast },
  };
}

function dark(
  id: string,
  name: string,
  accent: string,
  background: string,
  foreground: string,
  contrast = CONTRAST_DEFAULT,
): ThemePreset {
  return {
    id,
    name,
    appearance: "dark",
    def: { accent, background, foreground, contrast },
  };
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  light("light", "Light", "#5E6AD2", "#ffffff", "#1B1B1B"),
  light("paper", "Paper", "#E8590C", "#FCFBF8", "#1C1917"),
  light("mint", "Mint", "#0CA678", "#F5FBF8", "#0B1F18"),
  light("rose", "Rose", "#E64980", "#ffffff", "#1B1B1B"),
  light("grape", "Grape", "#7C5CFF", "#ffffff", "#1B1B1B"),
  light("cloud", "Cloud", "#5B8DEF", "#F4F6FA", "#1A1D26"),
  light("sand", "Sand", "#C27803", "#F7F3EB", "#1C1914"),
  light("sky", "Sky", "#0EA5E9", "#F0F9FF", "#0C1929"),
  light("lime", "Lime", "#65A30D", "#F7FEE7", "#1A2E05"),
  light("coral", "Coral", "#F04343", "#FFF7F5", "#1F1210"),
  light("lavender", "Lavender", "#8B5CF6", "#F8F5FF", "#1A1228"),
  light("slate", "Slate", "#64748B", "#F8FAFC", "#0F172A"),
  light("peach", "Peach", "#EA580C", "#FFF7ED", "#1C1008"),
  light("seafoam", "Seafoam", "#14B8A6", "#F0FDFA", "#042F2E"),
  light("ink", "Ink", "#2563EB", "#F5F5F4", "#171717", 45),

  dark("dark", "Dark", "#5E6AD2", "#0A0A0A", "#EEEEEE"),
  dark("midnight", "Midnight", "#4C8DFF", "#0B0F1A", "#E8EEF8"),
  dark("forest", "Forest", "#2FB380", "#0A0F0C", "#E6F4EC"),
  dark("plum", "Plum", "#A17CFF", "#100A16", "#F0E8FF"),
  dark("ember", "Ember", "#FF8A3D", "#140D0A", "#FFEDE0"),
  dark("charcoal", "Charcoal", "#94A3B8", "#121212", "#E5E5E5"),
  dark("navy", "Navy", "#60A5FA", "#0A1224", "#E2E8F0"),
  dark("olive", "Olive", "#A3E635", "#0F140A", "#ECFCCB"),
  dark("wine", "Wine", "#FB7185", "#1A0B10", "#FFE4E6"),
  dark("graphite", "Graphite", "#38BDF8", "#16181D", "#F1F5F9"),
  dark("cocoa", "Cocoa", "#FBBF24", "#1A1410", "#FEF3C7"),
  dark("aurora", "Aurora", "#34D399", "#0B1214", "#D1FAE5"),
  dark("violet", "Violet", "#C084FC", "#120B1C", "#F3E8FF"),
  dark("crimson", "Crimson", "#F87171", "#1A0C0C", "#FEE2E2"),
  dark("zinc", "Zinc", "#A1A1AA", "#09090B", "#FAFAFA", 45),
] as const;

const PRESETS_BY_ID = new Map(THEME_PRESETS.map((p) => [p.id, p]));

export const CUSTOM_PRESET_ID = "custom";

export function getPreset(id: string): ThemePreset | undefined {
  return PRESETS_BY_ID.get(id);
}

function hexEq(a: string, b: string): boolean {
  return (
    a.replace(/^#/, "").toLowerCase() === b.replace(/^#/, "").toLowerCase()
  );
}

function themeDefsMatch(a: ThemeDef, b: ThemeDef): boolean {
  return (
    hexEq(a.accent, b.accent) &&
    hexEq(a.background, b.background) &&
    hexEq(a.foreground, b.foreground) &&
    a.contrast === b.contrast
  );
}

export function isCustomTheme(presetId: string, def: ThemeDef): boolean {
  if (presetId === CUSTOM_PRESET_ID) return true;
  const preset = getPreset(presetId);
  if (!preset) return true;
  return !themeDefsMatch(preset.def, def);
}

export function lightPresets(): ThemePreset[] {
  return THEME_PRESETS.filter((p) => p.appearance === "light");
}

export function darkPresets(): ThemePreset[] {
  return THEME_PRESETS.filter((p) => p.appearance === "dark");
}

export interface ThemePrefsSlice {
  preferences: {
    appearance: ThemeAppearance;
    light: ThemeDef;
    dark: ThemeDef;
  };
}

export function resolveActiveTheme(
  prefs: ThemePrefsSlice,
  systemPrefersDark: boolean,
): ThemeDef {
  const p = prefs.preferences;
  const useDark =
    p.appearance === "dark" || (p.appearance === "system" && systemPrefersDark);
  return useDark ? p.dark : p.light;
}

export function resolveAppearance(
  prefs: ThemePrefsSlice,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (prefs.preferences.appearance === "light") return "light";
  if (prefs.preferences.appearance === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export type { ThemeAppearance };
