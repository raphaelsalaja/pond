import { Select } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ReactNode } from "react";
import { z } from "zod";
import styles from "./styles.module.css";

const StringLabelSchema = z.string();

export interface EnumOption<T> {
  value: T;
  label: ReactNode;
}

interface EnumSelectProps<T> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<EnumOption<T>>;
  placeholder?: ReactNode;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

function longestStringLabel<T>(options: ReadonlyArray<EnumOption<T>>): string {
  let longest = "";
  for (const option of options) {
    const label = StringLabelSchema.safeParse(option.label);
    if (label.success && label.data.length > longest.length) {
      longest = label.data;
    }
  }
  return longest;
}

export function EnumSelect<T>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  align,
  side,
  sideOffset = 6,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: EnumSelectProps<T>) {
  const selected = options.find((option) => Object.is(option.value, value));
  const hasNullOption = options.some((option) => option.value === null);
  const sizer = longestStringLabel(options);

  return (
    <Select.Root<T>
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === null && !hasNullOption) return;
        const match = options.find((option) => Object.is(option.value, next));
        if (match) onValueChange(match.value);
      }}
    >
      <Select.Trigger
        className={className}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
      >
        <span className={styles.slot}>
          {sizer ? (
            <span className={styles.sizer} aria-hidden>
              {sizer}
            </span>
          ) : null}
          <Select.Value className={cn(sizer && styles.value)}>
            {selected?.label ?? placeholder}
          </Select.Value>
        </span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={sideOffset} align={align} side={side}>
          <Select.Popup>
            <Select.Items
              items={options.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
