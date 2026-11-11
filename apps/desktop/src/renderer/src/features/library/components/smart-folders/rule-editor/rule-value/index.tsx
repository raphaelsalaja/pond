import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import type { Predicate, PredicateValue } from "@pond/schema/filters/types";
import { orderRuleChoices } from "../choices";
import { FieldInput } from "../field-input";
import {
  choicesFor,
  colorValueSchema,
  listOperators,
  listValueSchema,
  scalarValue,
} from "../predicate-helpers";
import { RuleSelect } from "../rule-select";
import type { RuleChoice, RuleChoices } from "../types";
import styles from "./styles.module.css";

interface ChoiceValueProps {
  rule: Predicate;
  choices: readonly RuleChoice[];
  onChange: (value: PredicateValue) => void;
}

function ChoiceValue({ rule, choices, onChange }: ChoiceValueProps) {
  const selected = listValueSchema.safeParse(rule.value);
  const values = selected.success ? selected.data.map(String) : [];
  const known = new Set(choices.map((choice) => choice.value));
  const ordered =
    rule.field === "folder" || rule.field === "tags"
      ? orderRuleChoices(choices)
      : choices;
  const items = [
    ...ordered,
    ...values
      .filter((value) => !known.has(value))
      .map((value) => ({ value, label: value })),
  ];
  return (
    <RuleSelect.Multiple
      value={values}
      items={items}
      label={`${FIELD_DESCRIPTORS[rule.field].label} Values`}
      placeholder="Choose Values"
      onChange={onChange}
    />
  );
}

interface DateValueProps {
  value: PredicateValue;
  onChange: (value: string) => void;
  label: string;
}

function DateValue({ value, onChange, label }: DateValueProps) {
  const raw = scalarValue(value);
  const relative = raw.startsWith("-P");
  const presets = [
    { value: "date", label: "Date" },
    { value: "-P1D", label: "1 Day Ago" },
    { value: "-P7D", label: "7 Days Ago" },
    { value: "-P30D", label: "30 Days Ago" },
    { value: "-P1Y", label: "1 Year Ago" },
  ];
  if (relative && !presets.some((preset) => preset.value === raw))
    presets.push({ value: raw, label: raw });
  return (
    <div className={styles.values}>
      <RuleSelect.Single
        value={relative ? raw : "date"}
        items={presets}
        label={`${label} Mode`}
        onChange={(next) => onChange(next === "date" ? "" : next)}
      />
      {!relative ? (
        <FieldInput
          label={label}
          type="date"
          value={raw.slice(0, 10)}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

interface RuleValueProps {
  rule: Predicate;
  choices: RuleChoices;
  onChange: (value: PredicateValue) => void;
}

export function RuleValue({ rule, choices, onChange }: RuleValueProps) {
  const field = FIELD_DESCRIPTORS[rule.field];
  const label = `${field.label} Value`;
  if (rule.operator === "empty")
    return <span className={styles["no-value"]}>No values</span>;
  if (rule.operator === "exists")
    return (
      <RuleSelect.Single
        value={rule.value === false ? "false" : "true"}
        label={label}
        items={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        onChange={(value) => onChange(value === "true")}
      />
    );
  if (rule.operator === "near") {
    const color = colorValueSchema.safeParse(rule.value);
    const hex = color.success
      ? color.data.hex
      : scalarValue(rule.value) || "#808080";
    const tolerance = color.success ? color.data.tolerance : 12;
    return (
      <div className={styles.values}>
        <FieldInput
          label={label}
          type="color"
          value={hex}
          onChange={(next) => onChange({ hex: next, tolerance })}
        />
        <RuleSelect.Single
          value={String(tolerance)}
          label="Color Similarity"
          items={[
            { value: "5", label: "Almost the Same" },
            { value: "12", label: "Similar" },
            { value: "25", label: "Broad" },
            ...([5, 12, 25].includes(tolerance)
              ? []
              : [{ value: String(tolerance), label: String(tolerance) }]),
          ]}
          onChange={(next) => onChange({ hex, tolerance: Number(next) })}
        />
      </div>
    );
  }
  if (rule.operator === "between") {
    const parsed = listValueSchema.safeParse(rule.value);
    const values = parsed.success ? parsed.data : ["", ""];
    return (
      <div className={styles.values}>
        {[0, 1].map((index) => {
          const value = String(values[index] ?? "");
          const change = (next: string) =>
            onChange(
              index === 0 ? [next, values[1] ?? ""] : [values[0] ?? "", next],
            );
          return field.type === "date" ? (
            <DateValue
              key={index}
              value={value}
              onChange={change}
              label={`${label} ${index === 0 ? "From" : "To"}`}
            />
          ) : (
            <FieldInput
              key={index}
              type="number"
              label={`${label} ${index === 0 ? "From" : "To"}`}
              value={value}
              onChange={change}
            />
          );
        })}
      </div>
    );
  }
  if (field.type === "date")
    return <DateValue value={rule.value} onChange={onChange} label={label} />;
  const options = choicesFor(field, choices);
  if (listOperators.has(rule.operator)) {
    if (options.length > 0 || field.id === "folder")
      return <ChoiceValue rule={rule} choices={options} onChange={onChange} />;
    const parsed = listValueSchema.safeParse(rule.value);
    return (
      <FieldInput
        label={label}
        value={parsed.success ? parsed.data.join(", ") : ""}
        placeholder="Separate values with commas"
        width="full"
        onChange={(next) =>
          onChange(next.split(",").map((value) => value.trim()))
        }
      />
    );
  }
  if (options.length > 0 && field.type === "enum" && field.id !== "aspect")
    return (
      <RuleSelect.Single
        label={label}
        value={scalarValue(rule.value)}
        items={[{ value: "", label: "Choose Value" }, ...options]}
        onChange={onChange}
      />
    );
  return (
    <FieldInput
      label={label}
      type={field.type === "number" ? "number" : "text"}
      value={scalarValue(rule.value)}
      onChange={onChange}
      width="full"
      placeholder={
        field.id === "aspect"
          ? "16:9"
          : field.id === "duration"
            ? "Seconds"
            : field.id === "fileSize"
              ? "Bytes"
              : undefined
      }
    />
  );
}
