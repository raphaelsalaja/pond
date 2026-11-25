import { FIELD_META } from "@pond/schema/filters/meta";
import { isPredicateList } from "@pond/schema/filters/types";
import type {
  FieldId,
  Predicate,
  PredicateValue,
} from "@pond/schema/filters/types";
import { z } from "zod";

type ChoiceValue = string | number;

export type ChoiceMode = "any" | "all" | "exclude";

function choiceMode(rule: Predicate): ChoiceMode | null {
  if (["neq", "nin", "none"].includes(rule.operator)) {
    return rule.negate ? "any" : "exclude";
  }
  if (["eq", "in", "some"].includes(rule.operator)) {
    return rule.negate ? "exclude" : "any";
  }
  if (rule.operator === "every" && !rule.negate) {
    return "all";
  }
  return null;
}

export function selectedChoiceMode(
  rows: ReadonlyArray<Predicate>,
  field: FieldId,
): "any" | "all" {
  return rows.some((row) => row.field === field && choiceMode(row) === "all")
    ? "all"
    : "any";
}

export function isChoiceSelected(
  rows: ReadonlyArray<Predicate>,
  option: Predicate,
  mode: ChoiceMode,
): boolean {
  return rows.some(
    (row) =>
      row.field === option.field &&
      (mode === "exclude"
        ? choiceMode(row) === "exclude"
        : ["any", "all"].includes(choiceMode(row) ?? "")) &&
      choiceValues(option).every((value) =>
        choiceValues(row).some((selected) => sameValue(value, selected)),
      ),
  );
}

export function changeChoiceMode(
  rows: ReadonlyArray<Predicate>,
  field: FieldId,
  mode: "any" | "all",
): Array<Predicate> {
  return rows.map((row) =>
    row.field === field && ["any", "all"].includes(choiceMode(row) ?? "")
      ? {
          ...row,
          operator: mode === "all" ? "every" : "some",
          value: choiceValues(row),
          negate: undefined,
        }
      : row,
  );
}

export function selectChoice(
  rows: ReadonlyArray<Predicate>,
  option: Predicate,
  checked: boolean,
  mode: ChoiceMode,
): Array<Predicate> {
  const field = option.field;
  const array = FIELD_META[field].type === "stringArray";
  const included: Array<ChoiceValue> = [];
  const excluded: Array<ChoiceValue> = [];
  for (const row of rows) {
    if (row.field !== field) continue;
    const current = choiceMode(row);
    if (current === null) continue;
    const bucket = current === "exclude" ? excluded : included;
    for (const value of choiceValues(row)) {
      const target =
        mode === "exclude" ? current === "exclude" : current !== "exclude";
      if (
        (checked || target) &&
        choiceValues(option).some((v) => sameValue(v, value))
      ) {
        continue;
      }
      if (!bucket.some((v) => sameValue(v, value))) {
        bucket.push(value);
      }
    }
  }
  if (checked) {
    (mode === "exclude" ? excluded : included).push(...choiceValues(option));
  }
  const rest = rows.filter(
    (row) =>
      row.field !== field ||
      (choiceMode(row) === null && row.operator !== "empty"),
  );
  const add = (selected: Array<ChoiceValue>, exclude: boolean) => {
    if (!selected.length) {
      return;
    }
    const value = array || selected.length > 1 ? selected : selected[0];
    if (value === undefined) return;
    rest.push({
      field,
      operator: array
        ? exclude
          ? "none"
          : mode === "all" ||
              (mode === "exclude" && selectedChoiceMode(rows, field) === "all")
            ? "every"
            : "some"
        : exclude
          ? selected.length === 1
            ? "neq"
            : "nin"
          : selected.length === 1
            ? "eq"
            : "in",
      value,
    });
  };
  add(included, false);
  add(excluded, true);
  return rest;
}

function isChoice(rule: Predicate): boolean {
  return !rule.negate && ["eq", "in", "some"].includes(rule.operator);
}

function values(rule: Predicate): Array<PredicateValue> {
  return isPredicateList(rule.value) ? [...rule.value] : [rule.value];
}

const Choice = z.union([z.string(), z.number()]);
const Text = z.string();

function choiceValues(rule: Predicate): Array<ChoiceValue> {
  return values(rule).flatMap((value) => {
    const parsed = Choice.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

function sameValue(a: PredicateValue, b: PredicateValue): boolean {
  const left = Text.safeParse(a);
  const right = Text.safeParse(b);
  return left.success && right.success
    ? left.data.toLowerCase() === right.data.toLowerCase()
    : JSON.stringify(a) === JSON.stringify(b);
}

export function isFilterSelected(
  rows: ReadonlyArray<Predicate>,
  option: Predicate,
): boolean {
  return rows.some((row) => {
    if (row.field !== option.field || row.negate) return false;
    if (isChoice(row) && isChoice(option)) {
      return values(option).every((value) =>
        values(row).some((selected) => sameValue(selected, value)),
      );
    }
    return (
      row.operator === option.operator && sameValue(row.value, option.value)
    );
  });
}

export function selectFilter(
  rows: ReadonlyArray<Predicate>,
  option: Predicate,
  checked: boolean,
): Array<Predicate> {
  const type = FIELD_META[option.field].type;
  if ((type === "enum" || type === "stringArray") && isChoice(option)) {
    const rest = rows.filter(
      (row) => row.field !== option.field || !isChoice(row),
    );
    const selected = rows
      .filter((row) => row.field === option.field && isChoice(row))
      .flatMap(choiceValues);
    const next = selected.filter(
      (value) =>
        !choiceValues(option).some((candidate) => sameValue(candidate, value)),
    );
    if (checked) next.push(...choiceValues(option));
    const unique = next.filter(
      (value, index) =>
        next.findIndex((candidate) => sameValue(candidate, value)) === index,
    );
    if (unique.length === 0) return rest;
    const value =
      type === "stringArray" || unique.length > 1 ? unique : unique[0];
    if (value === undefined) return rest;
    return [
      ...rest,
      {
        field: option.field,
        operator:
          type === "stringArray" ? "some" : unique.length === 1 ? "eq" : "in",
        value,
      },
    ];
  }
  const rest = rows.filter((row) => row.field !== option.field);
  return checked ? [...rest, option] : rest;
}
