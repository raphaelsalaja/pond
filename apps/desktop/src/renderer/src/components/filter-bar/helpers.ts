import { FIELD_META } from "@pond/schema/filters/meta";
import {
  COMPARATORS_BY_TYPE,
  type ComparatorId,
  type FieldId,
  type Predicate,
  type Query,
} from "@pond/schema/filters/types";

export interface AddCommitApi {
  // Append a fully-formed predicate (used by search-result rows and recents).
  commitOne: (predicate: Predicate) => void;
  // First live commit from a builder submenu; returns the new predicate's
  // index so subsequent picks can update the same chip in place.
  liveAdd: (predicate: Predicate) => number;
  // Update (or remove, when `predicate` is null) a live-committed predicate
  // at its tracked index.
  liveUpdate: (index: number, predicate: Predicate | null) => void;
}

export function topLevelPredicates(query: Query): Predicate[] {
  return query.clauses.filter((c): c is Predicate => c.kind === "p");
}

export function replacePredicate(
  query: Query,
  index: number,
  next: Predicate | null,
): Query {
  const clauses = [...query.clauses];
  if (index < 0 || index >= clauses.length) return query;
  if (next === null) clauses.splice(index, 1);
  else clauses[index] = next;
  return { kind: "and", clauses };
}

export function appendPredicate(query: Query, predicate: Predicate): Query {
  return { kind: "and", clauses: [...query.clauses, predicate] };
}

export function defaultPredicateFor(field: FieldId): Predicate {
  const meta = FIELD_META[field];
  const cmp = (COMPARATORS_BY_TYPE[meta.type][0] ?? "eq") as ComparatorId;
  return {
    kind: "p",
    field,
    cmp,
    value: emptyValueFor(cmp),
  };
}

export function emptyValueFor(cmp: ComparatorId): unknown {
  switch (cmp) {
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

export function predicatesEqual(a: Predicate, b: Predicate): boolean {
  if (a.field !== b.field || a.cmp !== b.cmp) return false;
  if (Boolean(a.negate) !== Boolean(b.negate)) return false;
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

export function predicateIsActive(p: Predicate): boolean {
  if (p.cmp === "exists") return true;
  const v = p.value;
  if (v == null) return false;
  if (Array.isArray(v)) {
    return v.some((x) => x !== "" && x !== 0 && x != null);
  }
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") {
    const hex = (v as { hex?: unknown }).hex;
    return typeof hex === "string" && hex.length > 0;
  }
  return true;
}
