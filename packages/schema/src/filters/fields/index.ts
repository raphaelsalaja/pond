import type { FieldId } from "../types";
import { account } from "./account";
import { caption } from "./caption";
import { color } from "./color";
import { creator } from "./creator";
import type { FieldDescriptor } from "./descriptor";
import { aspect, shape } from "./dims";
import { duration } from "./duration";
import { fileCount } from "./file-count";
import { modifiedAt } from "./modified-at";
import { note } from "./note";
import { publishedAt } from "./published-at";
import { savedAt } from "./saved-at";
import { source } from "./source";
import { tags } from "./tags";
import { transcript } from "./transcript";
import { typeField } from "./type";

export type {
  FieldDescriptor,
  FieldGroup,
  FieldPreset,
} from "./descriptor";
export { aspectFromDims, shapeFromDims } from "./dims";
export {
  durationProjection,
  tagsDistinctCount,
  tagsEmpty,
  tagsExists,
} from "./sql";

/** Insertion order is the field display order for FIELD_IDS and the filter bar chips. */
export const FIELD_DESCRIPTORS: Record<FieldId, FieldDescriptor> = {
  tags,
  source,
  type: typeField,
  fileCount,
  duration,
  shape,
  aspect,
  creator,
  account,
  note,
  caption,
  transcript,
  color,
  savedAt,
  publishedAt,
  modifiedAt,
};
