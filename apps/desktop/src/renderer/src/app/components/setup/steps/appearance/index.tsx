import {
  CUSTOM_PRESET_ID,
  darkPresets,
  getPreset,
  lightPresets,
} from "@pond/schema/db";
import { Settings, Toggle, ToggleGroup } from "@pond/ui";
import { useId } from "react";
import { ThemePresetSelect } from "@/features/settings";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { Demo } from "../../demo";
import { type Appearance, previewThemes, type StepProps } from "../../model";
import styles from "./styles.module.css";

const MODES: readonly { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LIGHT_PRESETS = lightPresets();
const DARK_PRESETS = darkPresets();

export function ThemeOptions({ choices, update }: StepProps) {
  const modeId = useId();
  return (
    <Settings.List className={styles.list}>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle id={modeId}>Mode</Settings.ItemTitle>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <ToggleGroup
            aria-labelledby={modeId}
            value={[choices.appearance]}
            onValueChange={(value) => {
              const next = MODES.find((item) => item.value === value[0]);
              if (next) update({ appearance: next.value });
            }}
          >
            {MODES.map(({ value, label }) => (
              <Toggle key={value} type="button" size="sm" value={value}>
                {label}
              </Toggle>
            ))}
          </ToggleGroup>
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item disabled={choices.appearance === "dark"}>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Light Theme</Settings.ItemTitle>
          <Settings.ItemDescription>
            Used in light mode.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <ThemePresetSelect
            aria-label="Light Theme"
            presets={LIGHT_PRESETS}
            value={choices.lightPreset}
            customDef={
              choices.lightPreset === CUSTOM_PRESET_ID
                ? choices.lightTheme
                : undefined
            }
            disabled={choices.appearance === "dark"}
            onChange={(lightPreset) => {
              const preset = getPreset(lightPreset);
              if (preset) update({ lightPreset, lightTheme: preset.def });
            }}
          />
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item disabled={choices.appearance === "light"}>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Dark Theme</Settings.ItemTitle>
          <Settings.ItemDescription>
            Used in dark mode.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <ThemePresetSelect
            aria-label="Dark Theme"
            presets={DARK_PRESETS}
            value={choices.darkPreset}
            customDef={
              choices.darkPreset === CUSTOM_PRESET_ID
                ? choices.darkTheme
                : undefined
            }
            disabled={choices.appearance === "light"}
            onChange={(darkPreset) => {
              const preset = getPreset(darkPreset);
              if (preset) update({ darkPreset, darkTheme: preset.def });
            }}
          />
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}

export function ThemePreview({ choices }: StepProps) {
  const appTheme = useResolvedTheme();
  const { dark, light, night } = previewThemes(choices, appTheme === "dark");
  return (
    <div className={styles.preview} aria-hidden>
      <div className={styles.window} data-front={!dark || undefined}>
        <Demo state="library" theme={light} />
      </div>
      <div
        className={styles.window}
        data-mode="dark"
        data-front={dark || undefined}
      >
        <Demo state="library" theme={night} />
      </div>
    </div>
  );
}
