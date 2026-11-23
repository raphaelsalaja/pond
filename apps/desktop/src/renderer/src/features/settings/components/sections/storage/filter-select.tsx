import { Select } from "@pond/ui";

export interface FilterOption<Value extends string = string> {
  value: Value;
  label: string;
}

export function FilterSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: FilterOption<Value>[];
  onChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        const option = options.find((entry) => entry.value === next);
        if (option) onChange(option.value);
      }}
    >
      <Select.Trigger size="sm" aria-label={label}>
        <Select.Value>
          {(current: string) =>
            options.find((option) => option.value === current)?.label ?? current
          }
        </Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6}>
          <Select.Popup>
            <Select.Items items={options} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
