/**
 * Filter query AST + field/comparator metadata. This file is the
 * source of truth for **shape**: what a filter looks like at rest.
 *
 * Pure types and pure data — no Drizzle, no Node, no DOM. The
 * renderer can pull this directly to render chips, parse URLs, and
 * round-trip filter state without touching the SQL layer.
 *
 * The runtime impl (JS evaluator, SQL builder, custom SQLite fns)
 * lives in sibling files and re-exports the types defined here.
 */

/**
 * A predicate is a single "field <comparator> value" clause. The
 * `value` shape depends on the comparator — see `ComparatorValue`
 * below for the per-comparator contract.
 */
export interface Predicate {
  kind: "p";
  field: FieldId;
  cmp: ComparatorId;
  value: unknown;
  /** Optional negation flag. Lets us encode `not in` without a
   * dedicated comparator. */
  negate?: boolean;
}

export interface And {
  kind: "and";
  clauses: Clause[];
}

export interface Or {
  kind: "or";
  clauses: Clause[];
}

export type Clause = Predicate | And | Or;

/**
 * Top-level filter expression. We always wrap in an outer `and` so
 * the empty filter (`clauses: []`) is the identity — every save
 * matches. That keeps the URL state, IPC payload, and JS evaluator
 * uniformly happy with a single shape.
 */
export type Query = And;

export const EMPTY_QUERY: Query = { kind: "and", clauses: [] };

/** Quick check for emptiness without walking the tree. */
export function isEmptyQuery(q: Query | null | undefined): boolean {
  if (!q) return true;
  return q.kind === "and" && q.clauses.length === 0;
}

/**
 * Coarse category for a filterable field. Each type defines which
 * comparators are valid (so the chip UI can list "is, is not, is
 * any of, …" automatically) and what the comparator value shape
 * looks like (string, number, ISO date, …).
 *
 * Adding a new field type means adding it here, declaring its
 * allowed comparators in `COMPARATORS_BY_TYPE`, and writing a
 * comparator impl that handles the projection it produces.
 */
export type FieldTypeId =
  | "string"
  | "stringArray"
  | "enum"
  | "number"
  | "boolean"
  | "date"
  | "color"
  | "optional";

/**
 * Closed set of comparators we support. New comparators must be
 * added here and given a JS + SQL impl in `comparators.ts`.
 */
export type ComparatorId =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "some"
  | "every"
  | "none"
  | "near"
  | "exists";

/**
 * Allowed comparators per field type. Used by the chip UI to render
 * the "is / is not / is any of / …" picker, and by IPC validation
 * to reject illegal predicates before they hit the SQL builder.
 */
export const COMPARATORS_BY_TYPE: Record<FieldTypeId, readonly ComparatorId[]> =
  {
    string: ["eq", "neq", "in", "nin", "contains", "startsWith", "endsWith"],
    stringArray: ["some", "every", "none"],
    enum: ["eq", "neq", "in", "nin"],
    number: ["eq", "neq", "lt", "lte", "gt", "gte", "between"],
    boolean: ["eq"],
    date: ["lt", "lte", "gt", "gte", "between"],
    color: ["near"],
    optional: ["exists"],
  };

/**
 * Closed set of filterable field IDs. Centralising the union here
 * means a typo at the URL layer turns into a type error rather than
 * a silent no-op match. The string values are used as URL keys and
 * settings storage keys, so they must stay stable across releases.
 */
export type FieldId =
  | "tags"
  | "source"
  | "type"
  | "shape"
  | "size"
  | "duration"
  | "dimensions"
  | "color"
  | "creator"
  | "url"
  | "note"
  | "savedAt"
  | "publishedAt"
  | "modifiedAt";

/**
 * Description of a filterable field as far as the chip UI / URL
 * codec / IPC validation are concerned.
 *
 * We deliberately keep this layer free of icons (renderer assets)
 * and SQL columns (Drizzle) so it can ship to both processes.
 */
export interface FieldMeta {
  id: FieldId;
  type: FieldTypeId;
  /** Human-readable label rendered on chips and dropdowns. */
  label: string;
  /** Loose grouping for the "Add filter" menu. */
  group: "content" | "media" | "time" | "people";
  /**
   * Optional preset values offered as quick-pick options. For
   * `enum` and `string` fields these become the dropdown rows; for
   * `number`/`date` fields they become quick-fill buttons.
   */
  presets?: ReadonlyArray<{ id: string; label: string; value: unknown }>;
}
