import { FIELD_META } from "@pond/schema/filters/meta";
import { isPredicateList } from "@pond/schema/filters/types";
import type {
  ComparatorId,
  FieldId,
  Predicate,
  PredicateValue,
} from "@pond/schema/filters/types";
import { describePredicate } from "@/features/search/query";
import { formatPlural } from "@/shared/lib/format";
import type { FilterOption } from "./options";
import { isFilterSelected } from "./selection";

export function emptyChoiceLabel(field: FieldId): string {
  if (field === "tags") {
    return "Untagged";
  }
  if (field === "folder") {
    return "No Folder";
  }
  if (field === "format") {
    return "No Format";
  }
  return "No List";
}

const COMPARATOR_SYMBOLS = new Map<ComparatorId, string>([
  ["gte", "≥"],
  ["gt", ">"],
  ["lte", "≤"],
  ["lt", "<"],
  ["neq", "≠"],
]);

const DATE_COMPARATOR_WORDS = new Map<ComparatorId, string>([
  ["gte", "Since"],
  ["gt", "After"],
  ["lte", "Until"],
  ["lt", "Before"],
  ["eq", "On"],
]);

const NOUNS = new Map<FieldId, readonly [string, string]>([
  ["rating", ["Star", "Stars"]],
  ["fileCount", ["File", "Files"]],
]);

const SUFFIXES = new Map<FieldId, string>([
  ["width", "px"],
  ["height", "px"],
  ["bpm", " BPM"],
  ["focalLength", "mm"],
]);

const PREFIXES = new Map<FieldId, string>([
  ["aperture", "ƒ/"],
  ["iso", "ISO "],
]);

const DURATION_UNITS = new Map([
  ["D", "Day"],
  ["W", "Week"],
  ["M", "Month"],
  ["Y", "Year"],
]);

const integer = new Intl.NumberFormat("en-US");
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const calendar = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function bytes(value: number): string {
  for (const [unit, size] of [
    ["TB", 1e12],
    ["GB", 1e9],
    ["MB", 1e6],
    ["KB", 1e3],
  ] as const) {
    if (value >= size) {
      return `${decimal.format(value / size)} ${unit}`;
    }
  }
  return `${integer.format(value)} B`;
}

function seconds(value: number): string {
  if (value !== 0 && value % 3600 === 0) {
    return `${value / 3600}h`;
  }
  if (value !== 0 && value % 60 === 0) {
    return `${value / 60}min`;
  }
  return `${value}s`;
}

function bare(field: FieldId, value: number): string {
  if (field === "fileSize") {
    return bytes(value);
  }
  if (field === "duration") {
    return seconds(value);
  }
  return `${PREFIXES.get(field) ?? ""}${integer.format(value)}${SUFFIXES.get(field) ?? ""}`;
}

function quantity(field: FieldId, value: number): string {
  if (field === "rating" && value === 0) {
    return "Unrated";
  }
  const noun = NOUNS.get(field);
  if (!noun) {
    return bare(field, value);
  }
  return formatPlural(value, { one: noun[0], other: noun[1] });
}

function numberSummary(rule: Predicate): string {
  const { field, operator, value } = rule;
  if (operator === "between" && Array.isArray(value)) {
    const [low, high] = value.map(Number);
    const noun = NOUNS.get(field);
    return noun
      ? `${integer.format(low ?? 0)}–${integer.format(high ?? 0)} ${noun[1]}`
      : `${bare(field, low ?? 0)}–${bare(field, high ?? 0)}`;
  }
  const symbol = COMPARATOR_SYMBOLS.get(operator);
  const text = quantity(field, Number(value));
  return symbol ? `${symbol} ${text}` : text;
}

function dateText(value: PredicateValue | undefined): string {
  const text = String(value ?? "");
  const relative = /^-P(\d+)([DWMY])$/i.exec(text);
  const unit = DURATION_UNITS.get(relative?.[2]?.toUpperCase() ?? "");
  if (relative && unit) {
    const count = Number(relative[1]);
    return count === 1 ? `Past ${unit}` : `Past ${count} ${unit}s`;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(text);
  return Number.isNaN(date.getTime()) ? text : calendar.format(date);
}

function dateSummary(rule: Predicate, exact: string | undefined): string {
  const name = FIELD_META[rule.field].label.replace(/^Date\s+/i, "");
  if (exact) {
    return `${name} ${exact}`;
  }
  const { operator, value } = rule;
  if (operator === "between" && isPredicateList(value)) {
    const from = dateText(value[0]);
    const to = dateText(value[1]);
    return from === to ? `${name} On ${from}` : `${name} ${from}–${to}`;
  }
  if (operator === "gte" && /^-P/i.test(String(value))) {
    return `${name} ${dateText(value)}`;
  }
  const word = DATE_COMPARATOR_WORDS.get(operator);
  return `${name} ${word ? `${word} ` : ""}${dateText(value)}`;
}

function optionLabel(option: FilterOption): string {
  return option.shortLabel ?? option.label;
}

export function filterSummary(
  rules: ReadonlyArray<Predicate>,
  options: ReadonlyArray<FilterOption>,
): string {
  return rules
    .map((rule) => {
      if (rule.negate) {
        return `Not ${filterSummary([{ ...rule, negate: false }], options)}`;
      }
      const type = FIELD_META[rule.field].type;
      const exact = options.find(
        (option) =>
          rule.operator === option.predicate.operator &&
          JSON.stringify(rule.value) === JSON.stringify(option.predicate.value),
      );
      if (type === "date") {
        return dateSummary(rule, exact?.label);
      }
      if (exact) {
        return optionLabel(exact);
      }
      if (rule.operator === "empty") {
        return emptyChoiceLabel(rule.field);
      }
      if (rule.operator === "contains") {
        return `“${String(rule.value)}”`;
      }
      if (type === "number") {
        return numberSummary(rule);
      }
      if (type === "enum" || type === "stringArray") {
        const values = isPredicateList(rule.value) ? rule.value : [rule.value];
        const label = values
          .map((value) => {
            const candidate = { ...rule, operator: "eq" as const, value };
            const option = options.find((choice) =>
              isFilterSelected([candidate], choice.predicate),
            );
            if (option) {
              return optionLabel(option);
            }
            return rule.field === "format"
              ? String(value).toUpperCase()
              : String(value);
          })
          .join(", ");
        return ["neq", "nin", "none"].includes(rule.operator)
          ? `Not ${label}`
          : rule.operator === "every"
            ? `All: ${label}`
            : label;
      }
      return describePredicate(rule).label;
    })
    .join(" · ");
}
