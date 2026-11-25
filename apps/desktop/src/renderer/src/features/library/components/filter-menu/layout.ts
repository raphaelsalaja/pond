import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId } from "@pond/schema/filters/types";

export type FilterLayout =
  | "compact"
  | "searchable"
  | "range"
  | "color"
  | "content";

const SEARCHABLE_FIELDS = new Set<FieldId>([
  "tags",
  "folder",
  "format",
  "creator",
  "account",
]);

export function filterLayout(
  field: FieldId,
  optionCount: number,
): FilterLayout {
  const type = FIELD_META[field].type;
  if (type === "color") return "color";
  if (type === "optional" || type === "string") return "content";
  if (type === "number" || type === "date") return "range";
  if (SEARCHABLE_FIELDS.has(field) || optionCount > 8) return "searchable";
  return "compact";
}

export function choiceIsSearchable(
  field: FieldId,
  optionCount: number,
): boolean {
  return filterLayout(field, optionCount) === "searchable";
}

export function editorIsSearchable(
  field: FieldId,
  optionCount: number,
): boolean {
  const type = FIELD_META[field].type;
  if (type === "optional" || type === "string") return true;
  return (
    (type === "enum" || type === "stringArray") &&
    choiceIsSearchable(field, optionCount)
  );
}
