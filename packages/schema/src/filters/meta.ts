import { FIELD_DESCRIPTORS } from "./fields";
import type { FieldId, FieldMeta } from "./types";

function isFieldId(value: string): value is FieldId {
  return value in FIELD_DESCRIPTORS;
}

const FIELD_ID_LIST = Object.keys(FIELD_DESCRIPTORS).filter(isFieldId);

export const FIELD_IDS: ReadonlyArray<FieldId> = Object.freeze(FIELD_ID_LIST);

function metaFor(id: FieldId): FieldMeta {
  const d = FIELD_DESCRIPTORS[id];
  const meta: FieldMeta = {
    id: d.id,
    type: d.type,
    label: d.label,
    group: d.group,
  };
  if (d.presets) {
    meta.presets = d.presets;
  }
  return meta;
}

function isComplete(
  meta: Partial<Record<FieldId, FieldMeta>>,
): meta is Record<FieldId, FieldMeta> {
  return FIELD_ID_LIST.every((id) => meta[id] !== undefined);
}

const fieldMeta: Partial<Record<FieldId, FieldMeta>> = {};
for (const id of FIELD_ID_LIST) {
  fieldMeta[id] = metaFor(id);
}
if (!isComplete(fieldMeta)) {
  throw new Error("Field metadata is missing a field");
}

export const FIELD_META: Readonly<Record<FieldId, FieldMeta>> =
  Object.freeze(fieldMeta);
