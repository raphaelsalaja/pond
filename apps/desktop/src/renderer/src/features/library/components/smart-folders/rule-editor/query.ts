import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import { isGroup } from "@pond/schema/filters/types";
import type {
  ComparatorId,
  FieldId,
  Predicate,
  PredicateValue,
  Query,
} from "@pond/schema/filters/types";
import { z } from "zod";
import {
  colorValueSchema,
  listOperators,
  listValueSchema,
  textValueSchema,
} from "./predicate-helpers";

const COLOR_PATTERN = /^#[\da-f]{6}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DATE_PATTERN = /^-P\d+[DWMY]$/;
const ASPECT_PATTERN = /^\d+(\.\d+)?:\d+(\.\d+)?$/;

export function defaultRuleValue(operator: ComparatorId): PredicateValue {
  if (operator === "empty") {
    return null;
  }
  if (operator === "exists") {
    return true;
  }
  if (operator === "between") {
    return ["", ""];
  }
  if (listOperators.has(operator)) {
    return [];
  }
  if (operator === "near") {
    return { hex: "#808080", tolerance: 12 };
  }
  return "";
}

export function newRule(field: FieldId = "title"): Predicate {
  const descriptor = FIELD_DESCRIPTORS[field];
  const operator = descriptor.comparators.includes("contains")
    ? "contains"
    : (descriptor.comparators[0] ?? "eq");
  return {
    id: crypto.randomUUID(),
    field,
    operator,
    value: defaultRuleValue(operator),
  };
}

export function editableQuery(query: Query): Query {
  return {
    ...query,
    id: crypto.randomUUID(),
    rules: query.rules.map((rule) =>
      isGroup(rule)
        ? editableQuery(rule)
        : { ...rule, id: crypto.randomUUID() },
    ),
  };
}

export function ruleQueryReady(query: Query): boolean {
  if (query.rules.length === 0) {
    return !query.not;
  }
  return query.rules.every((rule) => {
    if (isGroup(rule)) {
      return rule.rules.length > 0 && ruleQueryReady(rule);
    }
    const field = FIELD_DESCRIPTORS[rule.field];
    if (!field.comparators.includes(rule.operator)) {
      return false;
    }
    if (rule.operator === "empty") {
      return true;
    }
    if (rule.operator === "exists") {
      return z.boolean().safeParse(rule.value).success;
    }
    if (rule.operator === "near") {
      const color = colorValueSchema.safeParse(rule.value);
      return color.success
        ? COLOR_PATTERN.test(color.data.hex) && color.data.tolerance >= 0
        : z.string().regex(COLOR_PATTERN).safeParse(rule.value).success;
    }
    const values =
      listOperators.has(rule.operator) || rule.operator === "between"
        ? listValueSchema.safeParse(rule.value)
        : textValueSchema.transform((value) => [value]).safeParse(rule.value);
    if (!values.success || values.data.length === 0) {
      return false;
    }
    if (rule.operator === "between" && values.data.length !== 2) {
      return false;
    }
    if (values.data.some((value) => !String(value).trim())) {
      return false;
    }
    if (field.type === "number") {
      if (
        (rule.field === "fileCount" || rule.field === "rating") &&
        values.data.some((value) => !Number.isInteger(Number(value)))
      ) {
        return false;
      }
      if (
        rule.field === "rating" &&
        values.data.some((value) => Number(value) > 5)
      ) {
        return false;
      }
      if (
        values.data.some(
          (value) => !Number.isFinite(Number(value)) || Number(value) < 0,
        )
      ) {
        return false;
      }
      if (
        rule.operator === "between" &&
        Number(values.data[0]) > Number(values.data[1])
      ) {
        return false;
      }
    }
    if (field.type === "date") {
      if (
        values.data.some(
          (value) =>
            !RELATIVE_DATE_PATTERN.test(String(value)) &&
            !Number.isFinite(new Date(value).getTime()),
        )
      ) {
        return false;
      }
      if (
        rule.operator === "between" &&
        new Date(values.data[0] ?? "").getTime() >
          new Date(values.data[1] ?? "").getTime()
      ) {
        return false;
      }
    }
    if (
      rule.field === "aspect" &&
      values.data.some(
        (value) =>
          !ASPECT_PATTERN.test(String(value)) ||
          String(value)
            .split(":")
            .some((part) => Number(part) <= 0),
      )
    ) {
      return false;
    }
    return true;
  });
}

export function compileRuleQuery(query: Query): Query {
  return {
    ...query,
    rules: query.rules.map((rule) => {
      if (isGroup(rule)) {
        return compileRuleQuery(rule);
      }
      const field = FIELD_DESCRIPTORS[rule.field];
      const normalize = (
        value: string | number,
        upper: boolean,
      ): string | number => {
        if (field.type === "number") {
          return Number(value);
        }
        if (field.type === "date" && DATE_PATTERN.test(String(value))) {
          const date = new Date(`${value}T00:00:00`);
          if (upper) {
            date.setDate(date.getDate() + 1);
            date.setMilliseconds(-1);
          }
          return date.toISOString();
        }
        return value;
      };
      const list = listValueSchema.safeParse(rule.value);
      const scalar = textValueSchema.safeParse(rule.value);
      const value = list.success
        ? list.data.map((entry, index) =>
            normalize(entry, rule.operator === "between" && index === 1),
          )
        : scalar.success
          ? normalize(
              scalar.data,
              rule.operator === "lte" || rule.operator === "gt",
            )
          : rule.value;
      return { ...rule, value };
    }),
  };
}
