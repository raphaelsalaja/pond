/**
 * Field metadata table. The single source of truth for which
 * fields the user can filter on, what their UI label is, and what
 * presets the dropdowns offer.
 *
 * Kept in a renderer-safe file (no Drizzle / no icons) so the chip
 * UI and URL codec can read it without pulling the SQL world. The
 * matching projections + columns live in `./fields.ts` (main-only).
 */

import type { FieldId, FieldMeta } from "./types";

/* ------------------------------------------------------------------ */
/* Source presets                                                     */
/* ------------------------------------------------------------------ */

/**
 * Mirror of the `Source` enum from `@pond/schema/db`. Hard-coded
 * here so this file stays out of Drizzle's import graph; if the
 * enum grows we sync by hand.
 */
const SOURCE_PRESETS = [
  { id: "twitter", label: "Twitter / X", value: "twitter" },
  { id: "instagram", label: "Instagram", value: "instagram" },
  { id: "pinterest", label: "Pinterest", value: "pinterest" },
  { id: "arena", label: "Are.na", value: "arena" },
  { id: "cosmos", label: "Cosmos", value: "cosmos" },
  { id: "tiktok", label: "TikTok", value: "tiktok" },
  { id: "youtube", label: "YouTube", value: "youtube" },
  { id: "article", label: "Article", value: "article" },
] as const;

const TYPE_PRESETS = [
  { id: "image", label: "Image", value: "image" },
  { id: "video", label: "Video", value: "video" },
  { id: "article", label: "Article", value: "article" },
  { id: "url", label: "URL", value: "url" },
] as const;

const SHAPE_PRESETS = [
  { id: "landscape", label: "Landscape", value: "landscape" },
  { id: "portrait", label: "Portrait", value: "portrait" },
  { id: "square", label: "Square", value: "square" },
] as const;

/** Bytes thresholds — long-side / file size buckets used by the
 * size dropdown. The value is in bytes; the SQL column projects
 * `file_size` directly. */
const SIZE_PRESETS = [
  { id: "tiny", label: "< 1 MB", value: 1_000_000 },
  { id: "small", label: "< 5 MB", value: 5_000_000 },
  { id: "medium", label: "< 25 MB", value: 25_000_000 },
  { id: "large", label: "≥ 25 MB", value: 25_000_000 },
] as const;

/** Pixels — long-side bucket. The SQL column projects
 * `max(width, height)`. */
const DIMENSIONS_PRESETS = [
  { id: "small", label: "< 720 px", value: 720 },
  { id: "medium", label: "< 1080 px", value: 1080 },
  { id: "large", label: "< 4000 px", value: 4000 },
  { id: "huge", label: "≥ 4000 px", value: 4000 },
] as const;

/** Seconds — duration bucket for video. */
const DURATION_PRESETS = [
  { id: "short", label: "< 30s", value: 30 },
  { id: "medium", label: "< 3min", value: 180 },
  { id: "long", label: "< 10min", value: 600 },
  { id: "longer", label: "≥ 10min", value: 600 },
] as const;

/* ------------------------------------------------------------------ */
/* Field meta table                                                   */
/* ------------------------------------------------------------------ */

export const FIELD_META: Readonly<Record<FieldId, FieldMeta>> = Object.freeze({
  tags: {
    id: "tags",
    type: "stringArray",
    label: "Tags",
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
  color: {
    id: "color",
    type: "color",
    label: "Color",
    group: "media",
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
