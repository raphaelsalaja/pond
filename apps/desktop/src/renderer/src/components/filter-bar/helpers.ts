/**
 * AST manipulation helpers for the chip bar.
 *
 * The URL codec round-trips a `Query` (always a top-level `And` of
 * `Predicate`s in v1 — OR groups land via `?q=<base64>` and read
 * back the same way). The chip bar treats top-level predicates as
 * its primary unit of edit; this file packages the common
 * "add/remove/replace one predicate" flows so the React components
 * stay declarative.
 */

import { FIELD_META } from "@pond/schema/filters/meta";
import {
  COMPARATORS_BY_TYPE,
  type ComparatorId,
  type FieldId,
  type Predicate,
  type Query,
} from "@pond/schema/filters/types";

/** Top-level predicates only — nested AND/OR are skipped. */
export function topLevelPredicates(query: Query): Predicate[] {
  return query.clauses.filter((c): c is Predicate => c.kind === "p");
}

/** Replace the predicate at `index`. `null` removes it. */
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

/** First default predicate for a field — picks the first allowed
 * comparator and a sensible empty value. */
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
    case "near":
      return { hex: "" };
    case "exists":
      return true;
    default:
      return "";
  }
}

/** Are two predicates structurally equivalent? Used to skip URL
 * writes when nothing changed. */
export function predicatesEqual(a: Predicate, b: Predicate): boolean {
  if (a.field !== b.field || a.cmp !== b.cmp) return false;
  if (Boolean(a.negate) !== Boolean(b.negate)) return false;
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

/** Has the user actually typed/selected a value worth filtering on? */
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
