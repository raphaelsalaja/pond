export interface Predicate {
  kind: "p";
  field: FieldId;
  cmp: ComparatorId;
  value: unknown;
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

export type Query = And;

export const EMPTY_QUERY: Query = { kind: "and", clauses: [] };

export function isEmptyQuery(q: Query | null | undefined): boolean {
  if (!q) return true;
  return q.kind === "and" && q.clauses.length === 0;
}

export type FieldTypeId =
  | "string"
  | "stringArray"
  | "enum"
  | "number"
  | "boolean"
  | "date"
  | "optional";

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
  | "exists";

export const COMPARATORS_BY_TYPE: Record<FieldTypeId, readonly ComparatorId[]> =
  {
    string: ["eq", "neq", "in", "nin", "contains", "startsWith", "endsWith"],
    stringArray: ["some", "every", "none"],
    enum: ["eq", "neq", "in", "nin"],
    number: ["eq", "neq", "lt", "lte", "gt", "gte", "between"],
    boolean: ["eq"],
    date: ["lt", "lte", "gt", "gte", "between"],
    optional: ["exists"],
  };

export type FieldId =
  | "tags"
  | "source"
  | "type"
  | "shape"
  | "size"
  | "duration"
  | "dimensions"
  | "creator"
  | "url"
  | "note"
  | "savedAt"
  | "publishedAt"
  | "modifiedAt";

export interface FieldMeta {
  id: FieldId;
  type: FieldTypeId;
  label: string;
  group: "content" | "media" | "time" | "people";
  presets?: ReadonlyArray<{ id: string; label: string; value: unknown }>;
}
