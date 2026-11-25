import { CUSTOM_PRESET_ID } from "@pond/schema/db";
import type { ThemeDef } from "@pond/schema/db";
import { Select } from "@pond/ui";
import type { SelectItemSpec } from "@pond/ui";
import { ThemeChip } from "./chip";
import styles from "./styles.module.css";

interface PresetSelectProps {
  presets: Array<{ id: string; name: string; def: ThemeDef }>;
  value: string;
  /** Omitted to hide the Custom option. */
  customDef?: ThemeDef;
  disabled?: boolean;
  "aria-label"?: string;
  onChange: (id: string) => void;
}

export function PresetSelect({
  presets,
  value,
  customDef,
  disabled,
  "aria-label": ariaLabel,
  onChange,
}: PresetSelectProps) {
  const items = presets.map((preset): SelectItemSpec<string> => ({
    value: preset.id,
    label: <ThemeOption def={preset.def} label={preset.name} />,
  }));
  if (customDef) {
    items.push(
      { type: "separator" },
      {
        value: CUSTOM_PRESET_ID,
        label: <ThemeOption def={customDef} label="Custom" />,
      },
    );
  }

  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <Select.Trigger aria-label={ariaLabel}>
        <Select.Value>
          {(v: string) => {
            if (v === CUSTOM_PRESET_ID && customDef) {
              return <ThemeOption def={customDef} label="Custom" />;
            }
            const preset = presets.find((p) => p.id === v);
            return preset ? (
              <ThemeOption def={preset.def} label={preset.name} />
            ) : (
              v
            );
          }}
        </Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ThemeOption({ def, label }: { def: ThemeDef; label: string }) {
  return (
    <span className={styles.option}>
      <ThemeChip def={def} />
      <span>{label}</span>
    </span>
  );
}
