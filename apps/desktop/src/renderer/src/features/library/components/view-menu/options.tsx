import {
  IconBulletList,
  IconGrid,
  IconGridLayoutCols,
  IconGridLayoutRows,
} from "@pond/icons";
import type { ReactNode } from "react";
import type { LayoutValue } from "@/features/library/lib/view-prefs";
import type { ItemInfoField } from "@/features/saves";
import { SORT_OPTIONS } from "./sort";

export type CardDetail = "name" | "info" | "extension" | "source" | "count";
export type Quality = "fast" | "balanced" | "quality";
export type Fit = "fit" | "fill";
interface Option<Value extends string> {
  value: Value;
  label: string;
}

export const LAYOUTS: Array<Option<LayoutValue> & { icon: ReactNode }> = [
  {
    value: "waterfall",
    label: "Waterfall",
    icon: <IconGridLayoutCols size={16} />,
  },
  { value: "grid", label: "Grid", icon: <IconGrid size={16} /> },
  {
    value: "justified",
    label: "Justified",
    icon: <IconGridLayoutRows size={16} />,
  },
  { value: "list", label: "List", icon: <IconBulletList size={16} /> },
];

export const DETAILS: Array<Option<CardDetail>> = [
  { value: "name", label: "Name" },
  { value: "info", label: "Item Info" },
  { value: "extension", label: "Extension" },
  { value: "source", label: "Source" },
  { value: "count", label: "File Count" },
];

export const INFO_FIELDS: Array<Option<ItemInfoField>> = [
  { value: "dimensions", label: "Dimensions" },
  { value: "fileSize", label: "File Size" },
  { value: "tags", label: "Tags" },
  { value: "rating", label: "Rating" },
  { value: "modified", label: "Date Modified" },
  { value: "created", label: "Date Created" },
  { value: "published", label: "Date Published" },
];

export const QUALITIES: Array<Option<Quality>> = [
  { value: "fast", label: "Speed" },
  { value: "balanced", label: "Balanced" },
  { value: "quality", label: "Quality" },
];

export const FITS: Array<Option<Fit>> = [
  { value: "fit", label: "Fit" },
  { value: "fill", label: "Fill" },
];

export const SORTS = SORT_OPTIONS;

export const SIZE_MIN = 80;
export const SIZE_MAX = 360;
export const GAP_MAX = 48;

export interface Preset extends Option<string> {
  layout: LayoutValue;
  /** List rows ignore size and gap, so list presets leave them alone. */
  size?: number;
  gap?: number;
  rounding: number;
  fit: Fit;
  details: Record<CardDetail, boolean>;
  infoField?: ItemInfoField;
}

const BARE = {
  name: false,
  info: false,
  extension: false,
  source: false,
  count: false,
} satisfies Record<CardDetail, boolean>;

export const PRESETS: Preset[] = [
  {
    value: "calm",
    label: "Calm",
    layout: "grid",
    size: 200,
    gap: 24,
    rounding: 8,
    fit: "fill",
    details: { ...BARE, name: true },
  },
  {
    value: "moodboard",
    label: "Moodboard",
    layout: "waterfall",
    size: 220,
    gap: 12,
    rounding: 6,
    fit: "fit",
    details: BARE,
  },
  {
    value: "gallery",
    label: "Gallery",
    layout: "justified",
    size: 240,
    gap: 4,
    rounding: 0,
    fit: "fit",
    details: BARE,
  },
  {
    value: "dense",
    label: "Dense",
    layout: "grid",
    size: 110,
    gap: 6,
    rounding: 2,
    fit: "fill",
    details: BARE,
  },
  {
    value: "catalog",
    label: "Catalog",
    layout: "grid",
    size: 180,
    gap: 16,
    rounding: 6,
    fit: "fit",
    details: { ...BARE, name: true, info: true, extension: true },
    infoField: "dimensions",
  },
  {
    value: "inventory",
    label: "Inventory",
    layout: "list",
    rounding: 4,
    fit: "fit",
    details: {
      name: true,
      info: true,
      extension: true,
      source: true,
      count: true,
    },
    infoField: "fileSize",
  },
];
