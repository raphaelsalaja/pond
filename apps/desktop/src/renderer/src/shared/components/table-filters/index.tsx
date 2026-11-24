import { Chip, Menu } from "@pond/ui";
import type { ReactNode } from "react";
import { FilterToolbar } from "@/shared/components/filter-toolbar";
import { filterChipLabel, filterChipSummary } from "./chip-label";
import type { FilterOption } from "./chip-label";

export const TableFilterToggle = FilterToolbar.Toggle;
export const TableFilterBar = FilterToolbar.Bar;

export function TableFilterChip<T extends string>({
  name,
  icon,
  options,
  selected,
  onChange,
}: {
  name: string;
  icon: ReactNode;
  options: ReadonlyArray<FilterOption<T>>;
  selected: ReadonlySet<T>;
  onChange: (next: Set<T>) => void;
}) {
  const selectedLabels = options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
  const active = selected.size > 0;
  const label = filterChipSummary(name, selectedLabels);
  const ariaLabel = filterChipLabel(name, selectedLabels);
  return (
    <Chip.Filter
      icon={icon}
      label={label}
      title={ariaLabel}
      active={active}
      ariaLabel={ariaLabel}
      clearLabel={`Clear ${name} Filter`}
      onClear={() => onChange(new Set())}
    >
      <Chip.Popup aria-label={`${name} Filter`}>
        {options.map((option) => (
          <Menu.CheckboxItem
            key={option.id}
            closeOnClick={false}
            checked={selected.has(option.id)}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (checked) {
                next.add(option.id);
              } else {
                next.delete(option.id);
              }
              onChange(next);
            }}
          >
            <Menu.CheckboxItemIndicator />
            <Menu.ItemLabel>{option.label}</Menu.ItemLabel>
          </Menu.CheckboxItem>
        ))}
      </Chip.Popup>
    </Chip.Filter>
  );
}
