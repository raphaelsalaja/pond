import { FIELD_DESCRIPTORS } from "./fields";
import type { Clause, Query } from "./types";
import { isGroup, isPredicate } from "./types";

/** True only when every predicate can be represented by `buildWhere` without silently widening the query. */
export function queryIsFullySqlSupported(
  query: Query | null | undefined,
): boolean {
  if (!query) return true;
  return clauseIsSqlSupported(query);
}

function clauseIsSqlSupported(c: Clause): boolean {
  if (isGroup(c)) return c.rules.every(clauseIsSqlSupported);
  if (!isPredicate(c)) return false;
  /** Tags use correlated JSON clauses rather than a descriptor projection. */
  return (
    c.field === "tags" || Boolean(FIELD_DESCRIPTORS[c.field].sqlProjection)
  );
}

/** Color near-match has no SQL projection; callers post-filter those predicates in memory. */
export function queryHasColorPredicate(
  query: Query | null | undefined,
): boolean {
  if (!query) return false;
  return clauseHasColor(query);
}

function clauseHasColor(c: Clause): boolean {
  if (isGroup(c)) return c.rules.some(clauseHasColor);
  if (isPredicate(c)) return c.field === "color";
  return false;
}
