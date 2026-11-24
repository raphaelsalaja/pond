import { Select } from "@pond/ui";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

export function FilterSelect<Value extends string>({
  label,
  value,
  items,
  className,
  onChange,
}: {
  label: string;
  value: Value;
  items: Array<{ value: Value; label: string }>;
  className?: string;
  onChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <Select.Trigger
        size="sm"
        className={cn(styles.trigger, className)}
        aria-label={label}
      >
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start">
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
