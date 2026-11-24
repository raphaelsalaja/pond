import {
  CONTRAST_DEFAULT,
  CONTRAST_MAX,
  CONTRAST_MIN,
  CUSTOM_PRESET_ID,
  DEFAULT_DARK_PRESET_ID,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_PRESET_ID,
  DEFAULT_LIGHT_THEME,
  DEFAULT_PREFS,
  darkPresets,
  getPreset,
  isCustomTheme,
  lightPresets,
} from "@pond/schema/db";
import type { Prefs, ThemeAppearance, ThemeDef } from "@pond/schema/db";
import { ColorField, Input, Select, Settings, Slider } from "@pond/ui";
import { z } from "zod";
import type { Binding } from "@/features/settings/components/engine";
import { PresetSelect } from "@/features/settings/components/sections/theme";
import { clamp as clampNum } from "@/shared/lib/math";

const DEFAULTS = DEFAULT_PREFS.preferences;

type ThemePrefs = Prefs["preferences"];
type ThemeSide = "light" | "dark";

const ThemeDefSchema = z.object({
  accent: z.string(),
  background: z.string(),
  foreground: z.string(),
  contrast: z.number(),
});

const ThemeValuesSchema = z.object({
  appearance: z.enum(["system", "light", "dark"]).optional().catch(undefined),
  lightPresetId: z.string().optional().catch(undefined),
  darkPresetId: z.string().optional().catch(undefined),
  light: ThemeDefSchema.optional().catch(undefined),
  dark: ThemeDefSchema.optional().catch(undefined),
});

function readTheme(binding: Binding) {
  const values = ThemeValuesSchema.parse(binding.values);
  return {
    patch: (delta: Partial<ThemePrefs>) => {
      void binding.patch(delta);
    },
    appearance: values.appearance ?? DEFAULTS.appearance,
    lightPresetId: values.lightPresetId ?? DEFAULTS.lightPresetId,
    darkPresetId: values.darkPresetId ?? DEFAULTS.darkPresetId,
    light: values.light ?? DEFAULT_LIGHT_THEME,
    dark: values.dark ?? DEFAULT_DARK_THEME,
  };
}

const APPEARANCE_OPTIONS: Array<{ value: ThemeAppearance; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function customColorsVisible(side: ThemeSide) {
  return (values: Binding["values"]) => {
    const theme = ThemeValuesSchema.parse(values);
    const presetId =
      side === "light"
        ? (theme.lightPresetId ?? DEFAULT_LIGHT_PRESET_ID)
        : (theme.darkPresetId ?? DEFAULT_DARK_PRESET_ID);
    const def =
      side === "light"
        ? (theme.light ?? DEFAULT_LIGHT_THEME)
        : (theme.dark ?? DEFAULT_DARK_THEME);
    return isCustomTheme(presetId, def);
  };
}

export function AppearanceRow({ binding }: { binding: Binding }) {
  const { patch, appearance } = readTheme(binding);
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Appearance</Settings.ItemTitle>
        <Settings.ItemDescription>
          Follow the system, or lock to light or dark.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Select.Root
          value={appearance}
          onValueChange={(next) => {
            if (next === "system" || next === "light" || next === "dark") {
              patch({ appearance: next });
            }
          }}
        >
          <Select.Trigger>
            <Select.Value>
              {(v: string) =>
                APPEARANCE_OPTIONS.find((o) => o.value === v)?.label ?? v
              }
            </Select.Value>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup>
                <Select.Items
                  items={APPEARANCE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </Settings.ItemControl>
    </>
  );
}

function isNumberList(
  value: number | ReadonlyArray<number>,
): value is ReadonlyArray<number> {
  return typeof value !== "number";
}

function sideState(
  side: ThemeSide,
  state: ReturnType<typeof readTheme>,
): { presetId: string; def: ThemeDef } {
  return side === "light"
    ? { presetId: state.lightPresetId, def: state.light }
    : { presetId: state.darkPresetId, def: state.dark };
}

export function ThemePresetRow({
  binding,
  side,
}: {
  binding: Binding;
  side: ThemeSide;
}) {
  const state = readTheme(binding);
  const { presetId, def } = sideState(side, state);
  const presets = side === "light" ? lightPresets() : darkPresets();
  const selected = isCustomTheme(presetId, def) ? CUSTOM_PRESET_ID : presetId;
  const copy =
    side === "light"
      ? {
          title: "Light",
          description: "Used when the system is light.",
        }
      : {
          title: "Dark",
          description: "Used when the system is dark.",
        };
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{copy.title}</Settings.ItemTitle>
        <Settings.ItemDescription>{copy.description}</Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <PresetSelect
          presets={presets}
          value={selected}
          customDef={def}
          onChange={(id) => {
            if (id === CUSTOM_PRESET_ID) {
              if (side === "light") {
                state.patch({ lightPresetId: id });
              } else {
                state.patch({ darkPresetId: id });
              }
              return;
            }
            const preset = getPreset(id);
            if (!preset) {
              return;
            }
            if (side === "light") {
              state.patch({
                lightPresetId: id,
                light: { ...preset.def },
              });
            } else {
              state.patch({
                darkPresetId: id,
                dark: { ...preset.def },
              });
            }
          }}
        />
      </Settings.ItemControl>
    </>
  );
}

export function ThemeColorRow({
  binding,
  side,
  field,
}: {
  binding: Binding;
  side: ThemeSide;
  field: "accent" | "background" | "foreground";
}) {
  const state = readTheme(binding);
  const { def } = sideState(side, state);
  const labels = {
    accent: {
      title: "Accent",
      description: "Buttons, links, and selection.",
    },
    background: {
      title: "Background",
      description: "Base surface of the interface.",
    },
    foreground: {
      title: "Foreground",
      description: "Text and high-contrast ink.",
    },
  } as const;
  const copy = labels[field];
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{copy.title}</Settings.ItemTitle>
        <Settings.ItemDescription>{copy.description}</Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <ColorField.Root
          aria-label={`${side} ${copy.title.toLowerCase()}`}
          value={def[field]}
          onChange={(hex) => {
            if (side === "light") {
              state.patch({
                lightPresetId: CUSTOM_PRESET_ID,
                light: { ...def, [field]: hex },
              });
            } else {
              state.patch({
                darkPresetId: CUSTOM_PRESET_ID,
                dark: { ...def, [field]: hex },
              });
            }
          }}
        />
      </Settings.ItemControl>
    </>
  );
}

export function ThemeContrastRow({
  binding,
  side,
}: {
  binding: Binding;
  side: ThemeSide;
}) {
  const state = readTheme(binding);
  const { def } = sideState(side, state);
  const contrast = Number.isFinite(def.contrast)
    ? def.contrast
    : CONTRAST_DEFAULT;

  const setContrast = (next: number) => {
    const value = clampNum(Math.round(next), CONTRAST_MIN, CONTRAST_MAX);
    if (side === "light") {
      state.patch({
        lightPresetId: CUSTOM_PRESET_ID,
        light: { ...def, contrast: value },
      });
    } else {
      state.patch({
        darkPresetId: CUSTOM_PRESET_ID,
        dark: { ...def, contrast: value },
      });
    }
  };

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Contrast</Settings.ItemTitle>
        <Settings.ItemDescription>
          Surfaces, borders, and text.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Slider.Root
          min={CONTRAST_MIN}
          max={CONTRAST_MAX}
          step={5}
          value={contrast}
          onValueChange={(next: number | ReadonlyArray<number>) => {
            setContrast(isNumberList(next) ? (next[0] ?? contrast) : next);
          }}
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb aria-label={`${side} contrast`} />
            </Slider.Track>
          </Slider.Control>
          <Input.Root size="sm">
            <Input.Field
              type="number"
              min={CONTRAST_MIN}
              max={CONTRAST_MAX}
              step={5}
              aria-label={`${side} contrast value`}
              value={String(contrast)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  setContrast(n);
                }
              }}
              style={{ width: 44, textAlign: "right" }}
            />
          </Input.Root>
        </Slider.Root>
      </Settings.ItemControl>
    </>
  );
}
