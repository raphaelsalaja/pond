import type { FieldId, FieldMeta } from "./types";

const SOURCE_PRESETS = [
  { id: "twitter", label: "Twitter / X", value: "twitter" },
  { id: "instagram", label: "Instagram", value: "instagram" },
  { id: "pinterest", label: "Pinterest", value: "pinterest" },
  { id: "arena", label: "Are.na", value: "arena" },
  { id: "cosmos", label: "Cosmos", value: "cosmos" },
  { id: "tiktok", label: "TikTok", value: "tiktok" },
  { id: "youtube", label: "YouTube", value: "youtube" },
] as const;

const TYPE_PRESETS = [
  { id: "image", label: "Image", value: "image" },
  { id: "video", label: "Video", value: "video" },
  { id: "mixed", label: "Mixed", value: "mixed" },
  { id: "url", label: "URL", value: "url" },
] as const;

const SHAPE_PRESETS = [
  { id: "landscape", label: "Landscape", value: "landscape" },
  { id: "portrait", label: "Portrait", value: "portrait" },
  { id: "square", label: "Square", value: "square" },
] as const;

const SIZE_PRESETS = [
  { id: "tiny", label: "< 1 MB", value: 1_000_000 },
  { id: "small", label: "< 5 MB", value: 5_000_000 },
  { id: "medium", label: "< 25 MB", value: 25_000_000 },
  { id: "large", label: "≥ 25 MB", value: 25_000_000 },
] as const;

const DIMENSIONS_PRESETS = [
  { id: "small", label: "< 720 px", value: 720 },
  { id: "medium", label: "< 1080 px", value: 1080 },
  { id: "large", label: "< 4000 px", value: 4000 },
  { id: "huge", label: "≥ 4000 px", value: 4000 },
] as const;

const DURATION_PRESETS = [
  { id: "short", label: "< 30s", value: 30 },
  { id: "medium", label: "< 3min", value: 180 },
  { id: "long", label: "< 10min", value: 600 },
  { id: "longer", label: "≥ 10min", value: 600 },
] as const;

export const FIELD_META: Readonly<Record<FieldId, FieldMeta>> = Object.freeze({
  tags: {
    id: "tags",
    type: "stringArray",
    label: "Labels",
    group: "content",
  },
  source: {
    id: "source",
    type: "enum",
    label: "Source",
    group: "content",
    presets: SOURCE_PRESETS,
  },
  type: {
    id: "type",
    type: "enum",
    label: "Type",
    group: "media",
    presets: TYPE_PRESETS,
  },
  shape: {
    id: "shape",
    type: "enum",
    label: "Shape",
    group: "media",
    presets: SHAPE_PRESETS,
  },
  size: {
    id: "size",
    type: "number",
    label: "File size",
    group: "media",
    presets: SIZE_PRESETS,
  },
  duration: {
    id: "duration",
    type: "number",
    label: "Duration",
    group: "media",
    presets: DURATION_PRESETS,
  },
  dimensions: {
    id: "dimensions",
    type: "number",
    label: "Dimensions",
    group: "media",
    presets: DIMENSIONS_PRESETS,
  },
  creator: {
    id: "creator",
    type: "string",
    label: "Creator",
    group: "people",
  },
  url: {
    id: "url",
    type: "string",
    label: "URL",
    group: "content",
  },
  note: {
    id: "note",
    type: "optional",
    label: "Note",
    group: "content",
  },
  savedAt: {
    id: "savedAt",
    type: "date",
    label: "Saved",
    group: "time",
  },
  publishedAt: {
    id: "publishedAt",
    type: "date",
    label: "Published",
    group: "time",
  },
  modifiedAt: {
    id: "modifiedAt",
    type: "date",
    label: "Modified",
    group: "time",
  },
});

export const FIELD_IDS: readonly FieldId[] = Object.freeze(
  Object.keys(FIELD_META) as FieldId[],
);
