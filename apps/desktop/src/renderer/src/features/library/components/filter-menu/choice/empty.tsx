import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Menu } from "@pond/ui";
import type { ReactNode } from "react";
import { excludeGestures } from "./exclude";
import { ChoiceIndicator } from "./indicator";

export function EmptyChoice({
  field,
  label,
  count,
  icon,
  rows,
  onChange,
}: {
  field: FieldId;
  label: string;
  count: ReactNode;
  icon?: ReactNode;
  rows: Array<Predicate>;
  onChange: (rows: Array<Predicate>) => void;
}) {
  const current = rows.find(
    (row) => row.field === field && row.operator === "empty",
  );
  const change = (checked: boolean, excluded = false) => {
    const next = rows.filter((row) => row.field !== field);
    if (checked) {
      const predicate: Predicate = { field, operator: "empty", value: true };
      if (excluded) predicate.negate = true;
      next.push(predicate);
    }
    onChange(next);
  };
  return (
    <Menu.CheckboxItem
      closeOnClick={false}
      checked={!!current}
      data-excluded={current?.negate || undefined}
      aria-description={current?.negate ? "Excluded" : undefined}
      onCheckedChange={(checked) => change(checked)}
      {...excludeGestures(() => change(!current, true))}
    >
      <ChoiceIndicator excluded={current?.negate} />
      {icon ? <Menu.ItemIcon>{icon}</Menu.ItemIcon> : null}
      <Menu.ItemLabel>{label}</Menu.ItemLabel>
      {count === null ? null : (
        <Menu.SecondaryLabel>{count}</Menu.SecondaryLabel>
      )}
    </Menu.CheckboxItem>
  );
}
