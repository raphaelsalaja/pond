import { NumberField, Select as PondSelect } from "@pond/ui";
import { useState } from "react";

function Select<Value extends string>({
  label,
  items,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
}) {
  return (
    <PondSelect.Root
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next);
        if (match) onValueChange(match.value);
      }}
    >
      <PondSelect.Trigger variant="field" width="full" aria-label={label}>
        <PondSelect.Value />
      </PondSelect.Trigger>
      <PondSelect.Portal>
        <PondSelect.Positioner align="start" sideOffset={4}>
          <PondSelect.Popup>
            <PondSelect.Items items={[...items]} />
          </PondSelect.Popup>
        </PondSelect.Positioner>
      </PondSelect.Portal>
    </PondSelect.Root>
  );
}

/** Type the value, or drag its unit to scrub. Saves on blur, Enter, or scrub release. */
function Measure({
  label,
  value,
  min,
  max,
  unit = "px",
  disabled,
  onValueChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <NumberField.Root
      value={draft ?? value}
      min={min}
      max={max}
      step={1}
      largeStep={10}
      disabled={disabled}
      onValueChange={setDraft}
      onValueCommitted={(next) => {
        setDraft(null);
        if (next !== null && next !== value) onValueChange(next);
      }}
    >
      <NumberField.Input
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <NumberField.ScrubArea>{unit}</NumberField.ScrubArea>
    </NumberField.Root>
  );
}

export const Fields = { Measure, Select };
