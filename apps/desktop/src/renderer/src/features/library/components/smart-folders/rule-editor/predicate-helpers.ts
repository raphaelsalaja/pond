import type { FieldDescriptor } from "@pond/schema/filters/fields";
import type { ComparatorId, PredicateValue } from "@pond/schema/filters/types";
import { z } from "zod";
import type { RuleChoice, RuleChoices } from "./types";

export const OPERATOR_LABELS = {
  between: "is between",
  contains: "contains",
  empty: "is empty",
  endsWith: "ends with",
  eq: "is",
  every: "contains all",
  exact: "is exactly",
  exists: "has a value",
  gt: "is greater than",
  gte: "is at least",
  in: "is any of",
  lt: "is less than",
  lte: "is at most",
  near: "is similar to",
  neq: "is not",
  nin: "is none of",
  none: "contains none",
  some: "contains any",
  startsWith: "begins with",
} satisfies Record<ComparatorId, string>;

export const textValueSchema = z.union([z.string(), z.number()]);
export const listValueSchema = z.array(textValueSchema);
export const colorValueSchema = z.object({
  hex: z.string(),
  tolerance: z.number(),
});

export const listOperators = new Set<ComparatorId>([
  "in",
  "nin",
  "some",
  "every",
  "none",
  "exact",
]);

export function scalarValue(value: PredicateValue): string {
  const result = textValueSchema.safeParse(value);
  return result.success ? String(result.data) : "";
}

export function choicesFor(
  field: FieldDescriptor,
  choices: RuleChoices,
): ReadonlyArray<RuleChoice> {
  if (field.id === "folder") {
    return choices.folders;
  }
  if (field.id === "tags") {
    return choices.tags;
  }
  return (field.presets ?? []).flatMap((preset) => {
    const value = textValueSchema.safeParse(preset.value);
    return value.success
      ? [{ label: preset.label, value: String(value.data) }]
      : [];
  });
}
