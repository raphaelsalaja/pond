import { Checkbox, Field, Input, Select } from "@pond/ui";
import { useId } from "react";
import styles from "./styles.module.css";

function numberInRange(
  value: number | null,
  { min, max, integer, required }: NumberRule,
): boolean {
  if (value === null) return !required;
  if (Number.isNaN(value) || value < min || value > max) return false;
  return !integer || Number.isInteger(value);
}

interface NumberRule {
  min: number;
  max: number;
  integer?: boolean;
  required?: boolean;
}

function NumberField({
  label,
  suffix,
  value,
  min,
  max,
  step,
  integer = false,
  required = true,
  showError = false,
  onChange,
}: NumberRule & {
  label: string;
  suffix?: string;
  value: number | null;
  step?: number;
  showError?: boolean;
  onChange: (value: number | null) => void;
}) {
  const invalid =
    showError && !numberInRange(value, { min, max, integer, required });
  return (
    <Field.Root className={styles.field} invalid={invalid || undefined}>
      <Field.Label>{label}</Field.Label>
      <Input.Root>
        <Input.Field
          type="number"
          min={min}
          max={max}
          step={step}
          value={value === null || Number.isNaN(value) ? "" : value}
          onChange={(event) =>
            onChange(event.target.value ? event.target.valueAsNumber : null)
          }
        />
        {suffix ? <Input.Suffix>{suffix}</Input.Suffix> : null}
      </Input.Root>
      {invalid ? (
        <Field.Error
          match
        >{`Enter a number from ${min} to ${max}.`}</Field.Error>
      ) : null}
    </Field.Root>
  );
}

function LosslessField({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={styles.check}>
      <Checkbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      >
        <Checkbox.Indicator />
      </Checkbox.Root>
      <label htmlFor={id}>Lossless</label>
    </div>
  );
}

function SelectField<Value extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: Value;
  items: Array<{
    value: Value;
    label: string;
    disabled?: boolean;
  }>;
  onChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      value={value}
      items={items}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <div className={styles.field}>
        <Select.Label>{label}</Select.Label>
        <Select.Trigger width="full">
          <Select.Value />
        </Select.Trigger>
      </div>
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

export const ExportField = {
  Number: NumberField,
  Lossless: LosslessField,
  Select: SelectField,
};
