import type { ComponentType, ReactNode } from "react";
import type { DropdownProps } from "./dropdowns";
import {
  ColorDropdown,
  DateImportedDropdown,
  DateModifiedDropdown,
  DimensionsDropdown,
  DurationDropdown,
  FolderDropdown,
  NoteDropdown,
  RatingDropdown,
  ShapeDropdown,
  SizeDropdown,
  TagsDropdown,
  TypeDropdown,
  UrlDropdown,
} from "./dropdowns";
import {
  DATE_PRESETS,
  DIMENSION_BUCKETS,
  type FilterId,
  type FilterValues,
  SIZE_BUCKETS,
} from "./filters";
import {
  CalendarImportIcon,
  CalendarModifiedIcon,
  ColorIcon,
  DimensionsIcon,
  DurationIcon,
  FolderIcon,
  NoteIcon,
  ShapeIcon,
  SizeIcon,
  StarIcon,
  TagIcon,
  TypeIcon,
  UrlIcon,
} from "./icons";

/**
 * Single source of truth for the chip bar. Each definition pairs an
 * id (matching the URL serializer in `filters.ts`) with the visuals
 * (icon + label) and the dropdown component to render when the chip
 * is opened.
 *
 * `previewValue` is what the chip body shows when active — keep it
 * short (~12 chars) so the chip doesn't grow taller than ~28px.
 *
 * `status: "scaffold"` chips render a "Coming soon" body and never
 * appear in the active list, but they show up in the "Add filter"
 * popover (greyed out).
 *
 * Erased-type form. `Dropdown` and `previewValue` reference the per-id
 * `FilterValues[K]` shape, but TypeScript can't keep the K binding
 * sound across an array literal (invariant generic positions). We
 * widen to `unknown` for the array storage and re-narrow in the chip
 * via the `id` discriminator, which is the same pattern Linear's
 * Filterable + Radix's Slot use under the hood.
 */
export interface FilterDef {
  id: FilterId;
  label: string;
  icon: ComponentType<{ width?: string | number; height?: string | number }>;
  status: "stable" | "scaffold";
  Dropdown: ComponentType<{
    value: unknown;
    onChange: (next: unknown) => void;
  }>;
  /** What to show inside the chip when this filter is active. */
  previewValue: (value: unknown) => ReactNode;
}

/**
 * Strongly-typed factory. The K-narrowed callbacks are reduced to the
 * erased `FilterDef` shape on entry to the array, which lets the
 * authoring side stay safe while the consumer side keeps its K-less
 * interface.
 */
function defineFilter<K extends FilterId>(def: {
  id: K;
  label: string;
  icon: ComponentType<{ width?: string | number; height?: string | number }>;
  status: "stable" | "scaffold";
  Dropdown: ComponentType<DropdownProps<K>>;
  previewValue: (value: FilterValues[K]) => ReactNode;
}): FilterDef {
  return def as unknown as FilterDef;
}

function tagPreview(value: string[]): ReactNode {
  if (!value.length) return null;
  if (value.length === 1) return `#${value[0]}`;
  return `${value.length} tags`;
}

function typePreview(value: string[]): ReactNode {
  if (!value.length) return null;
  if (value.length === 1) return capitalise(value[0] ?? "");
  return `${value.length} types`;
}

function colorPreview(value: string[]): ReactNode {
  if (!value.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {value.slice(0, 4).map((hex) => (
        <span
          key={hex}
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 999,
            background: `#${hex}`,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
          }}
        />
      ))}
      {value.length > 4 ? <span>+{value.length - 4}</span> : null}
    </span>
  );
}

function bucketPreview<T extends { id: string; label: string }>(
  list: readonly T[],
  id: string | null,
): ReactNode {
  if (!id) return null;
  const def = list.find((b) => b.id === id);
  return def ? def.label.replace(/\s*\(.*\)\s*$/, "") : id;
}

function capitalise(s: string): string {
  if (!s) return s;
  if (s === "tiktok") return "TikTok";
  if (s === "youtube") return "YouTube";
  if (s === "twitter") return "Twitter";
  if (s === "arena") return "Are.na";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const FILTER_DEFS: ReadonlyArray<FilterDef> = [
  defineFilter({
    id: "color",
    label: "Color",
    icon: ColorIcon,
    status: "stable",
    Dropdown: ColorDropdown,
    previewValue: (v) => colorPreview(v),
  }),
  defineFilter({
    id: "tags",
    label: "Tags",
    icon: TagIcon,
    status: "stable",
    Dropdown: TagsDropdown,
    previewValue: (v) => tagPreview(v),
  }),
  defineFilter({
    id: "folder",
    label: "Folder",
    icon: FolderIcon,
    status: "scaffold",
    Dropdown: FolderDropdown,
    previewValue: () => null,
  }),
  defineFilter({
    id: "shape",
    label: "Shape",
    icon: ShapeIcon,
    status: "stable",
    Dropdown: ShapeDropdown,
    previewValue: (v) => (v ? capitalise(v) : null),
  }),
  defineFilter({
    id: "rating",
    label: "Rating",
    icon: StarIcon,
    status: "scaffold",
    Dropdown: RatingDropdown,
    previewValue: () => null,
  }),
  defineFilter({
    id: "type",
    label: "Types",
    icon: TypeIcon,
    status: "stable",
    Dropdown: TypeDropdown,
    previewValue: (v) => typePreview(v),
  }),
  defineFilter({
    id: "dimensions",
    label: "Dimensions",
    icon: DimensionsIcon,
    status: "stable",
    Dropdown: DimensionsDropdown,
    previewValue: (v) => bucketPreview(DIMENSION_BUCKETS, v),
  }),
  defineFilter({
    id: "duration",
    label: "Duration",
    icon: DurationIcon,
    status: "scaffold",
    Dropdown: DurationDropdown,
    previewValue: () => null,
  }),
  defineFilter({
    id: "size",
    label: "Size",
    icon: SizeIcon,
    status: "stable",
    Dropdown: SizeDropdown,
    previewValue: (v) => bucketPreview(SIZE_BUCKETS, v),
  }),
  defineFilter({
    id: "note",
    label: "Note",
    icon: NoteIcon,
    status: "stable",
    Dropdown: NoteDropdown,
    previewValue: (v) =>
      v === "with" ? "Has note" : v === "without" ? "No note" : null,
  }),
  defineFilter({
    id: "url",
    label: "URL",
    icon: UrlIcon,
    status: "stable",
    Dropdown: UrlDropdown,
    previewValue: (v) => (v ? `“${truncate(v, 14)}”` : null),
  }),
  defineFilter({
    id: "date_imported",
    label: "Date Imported",
    icon: CalendarImportIcon,
    status: "stable",
    Dropdown: DateImportedDropdown,
    previewValue: (v) => bucketPreview(DATE_PRESETS, v),
  }),
  defineFilter({
    id: "date_modified",
    label: "Date Modified",
    icon: CalendarModifiedIcon,
    status: "stable",
    Dropdown: DateModifiedDropdown,
    previewValue: (v) => bucketPreview(DATE_PRESETS, v),
  }),
];

export function getFilterDef(id: FilterId): FilterDef | undefined {
  return FILTER_DEFS.find((d) => d.id === id);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
