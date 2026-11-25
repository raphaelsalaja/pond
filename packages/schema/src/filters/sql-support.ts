import { FIELD_DESCRIPTORS } from "./fields";
import { buildWhere } from "./to-sql";
import type { Clause, Query } from "./types";
import { isGroup, isPredicate } from "./types";

export function queryIsFullySqlSupported(
  query: Query | null | undefined,
): boolean {
  if (!query) return true;
  try {
    if (!clauseIsSqlSupported(query)) return false;
    buildWhere(query);
    return true;
  } catch {
    return false;
  }
}

function clauseIsSqlSupported(c: Clause): boolean {
  if (isGroup(c)) return c.rules.every(clauseIsSqlSupported);
  if (!isPredicate(c)) return false;
  return (
    c.field === "tags" ||
    c.field === "folder" ||
    c.field === "list" ||
    c.field === "color" ||
    Boolean(FIELD_DESCRIPTORS[c.field].sqlProjection)
  );
}

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
