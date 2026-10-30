import type { RuleGroupType, RuleType } from "@react-querybuilder/core";

/** RQB `RuleType` narrowed to our unions, plus per-rule `negate`; RQB only has group `not`. */
export type PredicateValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<string | number>
  | Readonly<{ hex: string; tolerance: number }>;

export interface Predicate
  extends RuleType<FieldId, ComparatorId, PredicateValue> {
  negate?: boolean;
}

export type Group = RuleGroupType<Predicate, "and" | "or">;

export type Clause = Predicate | Group;

export type Query = Group;

export const EMPTY_QUERY: Query = { combinator: "and", rules: [] };

export function isEmptyQuery(q: Query | null | undefined): boolean {
  if (!q) return true;
  return q.rules.length === 0;
}

export function isGroup(clause: Clause): clause is Group {
  return "rules" in clause;
}

export function isPredicate(clause: Clause): clause is Predicate {
  return !("rules" in clause);
}

export type FieldTypeId =
  | "string"
  | "stringArray"
  | "enum"
  | "number"
  | "boolean"
  | "date"
  | "optional"
  | "color";

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
  | "exact"
  | "none"
  | "exists"
  | "empty"
  | "near";

export const COMPARATORS_BY_TYPE = {
  string: ["eq", "neq", "in", "nin", "contains", "startsWith", "endsWith"],
  stringArray: ["some", "every", "exact", "none", "empty"],
  enum: ["eq", "neq", "in", "nin"],
  number: ["eq", "neq", "lt", "lte", "gt", "gte", "between"],
  boolean: ["eq"],
  date: ["lt", "lte", "gt", "gte", "between"],
  optional: ["exists", "contains"],
  color: ["near"],
} satisfies Record<FieldTypeId, readonly ComparatorId[]>;

export type FieldId =
  | "title"
  | "tags"
  | "folder"
  | "list"
  | "source"
  | "importedFrom"
  | "type"
  | "format"
  | "fileCount"
  | "duration"
  | "shape"
  | "aspect"
  | "creator"
  | "account"
  | "note"
  | "caption"
  | "transcript"
  | "sensitiveContent"
  | "color"
  | "savedAt"
  | "publishedAt"
  | "modifiedAt"
  | "rating"
  | "fileSize"
  | "width"
  | "height"
  | "url"
  | "fontFamily"
  | "fontActivated"
  | "bpm"
  | "cameraMake"
  | "cameraModel"
  | "lensModel"
  | "focalLength"
  | "aperture"
  | "iso"
  | "takenAt";

export interface FieldMeta {
  id: FieldId;
  type: FieldTypeId;
  label: string;
  group: "content" | "media" | "time" | "people";
  presets?: ReadonlyArray<{ id: string; label: string; value: PredicateValue }>;
}
