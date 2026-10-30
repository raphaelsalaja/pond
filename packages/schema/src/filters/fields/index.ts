import type { FieldId } from "../types";
import { account } from "./account";
import { bpm } from "./bpm";
import {
  aperture,
  cameraMake,
  cameraModel,
  focalLength,
  iso,
  lensModel,
  takenAt,
} from "./camera";
import { caption } from "./caption";
import { color } from "./color";
import { creator } from "./creator";
import type { FieldDescriptor } from "./descriptor";
import { aspect, orientation } from "./dims";
import { duration } from "./duration";
import { fileCount } from "./file-count";
import { fileSize } from "./file-size";
import { folder } from "./folder";
import { fontActivated } from "./font-activated";
import { fontFamily } from "./font-family";
import { format } from "./format";
import { importedFrom } from "./imported-from";
import { list } from "./list";
import { modifiedAt } from "./modified-at";
import { note } from "./note";
import { publishedAt } from "./published-at";
import { rating } from "./rating";
import { savedAt } from "./saved-at";
import { sensitiveContent } from "./sensitive-content";
import { height, width } from "./size";
import { source } from "./source";
import { tags } from "./tags";
import { title } from "./title";
import { transcript } from "./transcript";
import { typeField } from "./type";
import { url } from "./url";

export type {
  FieldDescriptor,
  FieldGroup,
  FieldPreset,
} from "./descriptor";
export { aspectFromDims, orientationFromDims } from "./dims";
export {
  durationProjection,
  folderExists,
  tagsDistinctCount,
  tagsEmpty,
  tagsExists,
} from "./sql";

const orientationFieldId = "shape";

export const FIELD_DESCRIPTORS = {
  title,
  tags,
  folder,
  list,
  source,
  importedFrom,
  type: typeField,
  format,
  fileCount,
  duration,
  fontFamily,
  fontActivated,
  bpm,
  cameraMake,
  cameraModel,
  lensModel,
  focalLength,
  aperture,
  iso,
  [orientationFieldId]: orientation,
  aspect,
  creator,
  account,
  note,
  caption,
  transcript,
  sensitiveContent,
  color,
  savedAt,
  publishedAt,
  takenAt,
  modifiedAt,
  rating,
  fileSize,
  width,
  height,
  url,
} satisfies Record<FieldId, FieldDescriptor>;
