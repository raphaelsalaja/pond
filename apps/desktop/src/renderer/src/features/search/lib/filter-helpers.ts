import { FIELD_META } from "@pond/schema/filters/meta";
import { COMPARATORS_BY_TYPE } from "@pond/schema/filters/types";
import type {
  ComparatorId,
  FieldId,
  Predicate,
} from "@pond/schema/filters/types";
import { z } from "zod";

export function defaultPredicateFor(field: FieldId): Predicate {
  const meta = FIELD_META[field];
  const operator = COMPARATORS_BY_TYPE[meta.type][0] ?? "eq";
  return {
    field,
    operator,
    value: emptyValueFor(operator),
  };
}

function emptyValueFor(operator: ComparatorId) {
  switch (operator) {
    case "in":
    case "nin":
    case "some":
    case "every":
    case "none":
      return [];
    case "between":
      return [0, 0];
    case "exists":
      return true;
    default:
      return "";
  }
}

export function predicateIsActive(p: Predicate): boolean {
  if (p.operator === "exists" || p.operator === "empty") return true;
  const v = p.value;
  if (v === null || v === undefined) {
    return false;
  }
  if (Array.isArray(v)) {
    return v.some((x) => x !== "" && x !== 0 && x !== null && x !== undefined);
  }
  const text = z.string().safeParse(v);
  return text.success ? text.data.trim().length > 0 : true;
}
