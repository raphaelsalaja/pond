import {
  DEFAULT_LIGHT_THEME,
  darkPresets,
  getPreset,
  isCustomTheme,
  lightPresets,
  normalizeTheme,
  PrefsSchema,
  resolveActiveTheme,
  THEME_PRESETS,
} from "@pond/schema/db";
import { describe, expect, it } from "vitest";

describe("theme prefs rebuild", () => {
  it("defaults to dual light/dark sides under system appearance", () => {
    const prefs = PrefsSchema.parse({});
    expect(prefs.preferences.appearance).toBe("system");
    expect(prefs.preferences.lightPresetId).toBe("light");
    expect(prefs.preferences.darkPresetId).toBe("dark");
    expect(prefs.preferences.light.background).toBe("#ffffff");
    expect(prefs.preferences.dark.background).toBe("#0A0A0A");
    expect(prefs.preferences.light.foreground).toBeTruthy();
    expect(prefs.preferences.dark.foreground).toBeTruthy();
    expect(prefs.window.appIcon).toBe("aqua");
  });

  it("ships ~15 light and ~15 dark presets", () => {
    expect(lightPresets()).toHaveLength(15);
    expect(darkPresets()).toHaveLength(15);
    expect(THEME_PRESETS).toHaveLength(30);
  });

  it("keeps a stored dark side", () => {
    const prefs = PrefsSchema.parse({
      preferences: {
        appearance: "dark",
        darkPresetId: "custom",
        dark: {
          accent: "#ff0000",
          background: "#0A0A0A",
          foreground: "#EEEEEE",
          contrast: 40,
        },
      },
    });
    expect(prefs.preferences.appearance).toBe("dark");
    expect(prefs.preferences.dark.accent).toBe("#ff0000");
    expect(prefs.preferences.dark.contrast).toBe(40);
  });

  it("resolves active theme from appearance + system preference", () => {
    const prefs = PrefsSchema.parse({});
    expect(resolveActiveTheme(prefs, false).background).toBe("#ffffff");
    expect(resolveActiveTheme(prefs, true).background).toBe("#0A0A0A");
  });

  it("treats unknown or drifted presets as custom", () => {
    const mint = getPreset("mint");
    if (!mint) throw new Error("mint preset missing");
    expect(isCustomTheme("custom", mint.def)).toBe(true);
    expect(isCustomTheme("mint", mint.def)).toBe(false);
    expect(isCustomTheme("mint", { ...mint.def, accent: "#ff0000" })).toBe(
      true,
    );
    expect(isCustomTheme("missing", DEFAULT_LIGHT_THEME)).toBe(true);
  });

  it("moves themes still on the old default purple to the new accent", () => {
    const prefs = PrefsSchema.parse({
      preferences: {
        lightPresetId: "light",
        darkPresetId: "dark",
        light: { ...DEFAULT_LIGHT_THEME, accent: "#5E6AD2" },
        dark: {
          accent: "#5e6ad2",
          background: "#0A0A0A",
          foreground: "#EEEEEE",
          contrast: 50,
        },
      },
    });
    expect(prefs.preferences.light.accent).toBe("#00AAFF");
    expect(prefs.preferences.dark.accent).toBe("#00AAFF");
    expect(isCustomTheme("light", prefs.preferences.light)).toBe(false);
    expect(isCustomTheme("dark", prefs.preferences.dark)).toBe(false);

    const chosen = PrefsSchema.parse({
      preferences: { light: { ...DEFAULT_LIGHT_THEME, accent: "#7C5CFF" } },
    });
    expect(chosen.preferences.light.accent).toBe("#7C5CFF");
  });

  it("normalizes stored colors and derives the mode", () => {
    const prefs = PrefsSchema.parse({});
    expect(normalizeTheme(prefs.preferences.light)).toEqual({
      background: "#ffffff",
      foreground: "#1b1b1b",
      accent: "#00aaff",
      contrast: 50,
      mode: "light",
    });
    expect(normalizeTheme(prefs.preferences.dark).mode).toBe("dark");
    expect(
      normalizeTheme({
        background: "nope",
        foreground: "#EEE",
        accent: "",
        contrast: 400,
      }),
    ).toEqual({
      background: "#ffffff",
      foreground: "#eeeeee",
      accent: "#00aaff",
      contrast: 100,
      mode: "light",
    });
  });
});
