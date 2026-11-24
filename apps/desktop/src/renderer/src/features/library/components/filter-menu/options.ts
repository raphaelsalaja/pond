import {
  IconBagShopping,
  IconCalendar,
  IconCamera,
  IconDocument,
  IconFile,
  IconGlobe,
  IconImage,
  IconMovie,
  IconMusicNote,
  IconNotepad,
  IconText,
  IconTypography,
  IconVideo,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { COLOR_PRESETS } from "@pond/schema/filters/color";
import { FIELD_IDS, FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { createElement } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import {
  addLocalDays,
  endOfLocalDay,
  localDayPredicate,
  startOfLocalDay,
} from "@/features/library/lib/local-day";
import { DATE_PRESETS } from "@/features/search/query";

export interface FilterOption {
  label: string;
  /** Chip text when the chip icon already carries part of the label. */
  shortLabel?: string;
  predicate: Predicate;
  swatch?: string;
  crumb?: string;
  icon?: ReactNode;
}

export const FILTER_SECTIONS = [
  {
    label: "Organize",
    fields: ["tags", "folder", "source", "importedFrom", "inbox", "list"],
  },
  {
    label: "Media",
    fields: [
      "type",
      "format",
      "color",
      "shape",
      "aspect",
      "duration",
      "fontFamily",
      "fontActivated",
      "bpm",
      "cameraMake",
      "cameraModel",
      "lensModel",
      "focalLength",
      "aperture",
      "iso",
      "fileCount",
      "fileSize",
      "width",
    ],
  },
  {
    label: "Details",
    fields: [
      "rating",
      "favorite",
      "sensitiveContent",
      "creator",
      "account",
      "note",
      "caption",
      "transcript",
      "url",
    ],
  },
  {
    label: "Dates",
    fields: ["savedAt", "modifiedAt", "publishedAt", "takenAt"],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  fields: ReadonlyArray<FieldId>;
}>;

export const FILTER_GROUPS: ReadonlyArray<ReadonlyArray<FieldId>> =
  FILTER_SECTIONS.map(({ fields }) => fields);

export interface FilterMenuGroup {
  label: string;
  icon: IconComponent;
  fields: ReadonlyArray<FieldId>;
}

export type FilterMenuEntry = FieldId | FilterMenuGroup;

const FIELD_ENTRIES = new Set<FilterMenuEntry>(FIELD_IDS);

export function isFieldEntry(entry: FilterMenuEntry): entry is FieldId {
  return FIELD_ENTRIES.has(entry);
}

export function entryFields(entry: FilterMenuEntry): ReadonlyArray<FieldId> {
  return isFieldEntry(entry) ? [entry] : entry.fields;
}

/** Sections are split by dividers; a group shows as a submenu once two or more of its fields apply. */
export const FILTER_MENU: ReadonlyArray<ReadonlyArray<FilterMenuEntry>> = [
  [
    "tags",
    "folder",
    "source",
    "importedFrom",
    "inbox",
    "list",
    "type",
    "format",
    "color",
    "rating",
    "favorite",
    {
      label: "Dates",
      icon: IconCalendar,
      fields: ["savedAt", "modifiedAt", "publishedAt", "takenAt"],
    },
  ],
  [
    { label: "Image", icon: IconImage, fields: ["shape", "aspect", "width"] },
    {
      label: "Camera",
      icon: IconCamera,
      fields: [
        "cameraMake",
        "cameraModel",
        "lensModel",
        "focalLength",
        "aperture",
        "iso",
      ],
    },
    {
      label: "Audio & Video",
      icon: IconMovie,
      fields: ["duration", "bpm"],
    },
    {
      label: "Fonts",
      icon: IconTypography,
      fields: ["fontFamily", "fontActivated"],
    },
    { label: "File", icon: IconFile, fields: ["fileCount", "fileSize"] },
  ],
  [
    "creator",
    "account",
    "sensitiveContent",
    {
      label: "Text",
      icon: IconNotepad,
      fields: ["note", "caption", "transcript", "url"],
    },
  ],
];

/** These fields hide when no save carries their data; each maps to the field whose value proves it. */
export const DATA_GATED_FIELDS = new Map<FieldId, FieldId>([
  ["importedFrom", "importedFrom"],
  ["inbox", "inbox"],
  ["cameraMake", "cameraMake"],
  ["cameraModel", "cameraModel"],
  ["lensModel", "lensModel"],
  ["focalLength", "focalLength"],
  ["aperture", "aperture"],
  ["iso", "iso"],
  ["takenAt", "takenAt"],
  ["duration", "duration"],
  ["bpm", "bpm"],
  ["fontFamily", "fontFamily"],
  ["fontActivated", "fontFamily"],
  ["transcript", "transcript"],
]);

export function fieldMatchesQuery(
  field: FieldId,
  query: string,
  options: ReadonlyArray<FilterOption>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (FIELD_META[field].label.toLowerCase().includes(needle)) {
    return true;
  }
  return options.some((option) => option.label.toLowerCase().includes(needle));
}

export function choiceOptions(
  field: FieldId,
  choices: ReadonlyArray<{ label: string; value: string }>,
): Array<FilterOption> {
  return choices.map(({ label, value }) => ({
    label,
    predicate: {
      field,
      operator: FIELD_META[field].type === "stringArray" ? "some" : "eq",
      value: FIELD_META[field].type === "stringArray" ? [value] : value,
    },
  }));
}

function calendarDateOptions(field: FieldId): Array<FilterOption> {
  const now = new Date();
  const options: Array<FilterOption> = [
    { label: "Today", predicate: localDayPredicate(field, now, now) },
    {
      label: "Yesterday",
      predicate: localDayPredicate(field, addLocalDays(now, -1), now),
    },
    ...DATE_PRESETS.map(({ label, iso }) => ({
      label:
        iso === "-P1D"
          ? "Past 24 Hours"
          : label.replaceAll(/\b\w/g, (character) => character.toUpperCase()),
      predicate: { field, operator: "gte" as const, value: iso },
    })),
  ];
  if (field !== "modifiedAt") {
    return options;
  }
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  });
  for (let monthsAgo = 1; monthsAgo <= 6; monthsAgo++) {
    const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
    options.push({
      label: monthFormatter.format(start),
      predicate: {
        field,
        operator: "between",
        value: [startOfLocalDay(start), endOfLocalDay(end)],
      },
    });
  }
  return options;
}

const Choice = z.union([z.string(), z.number()]);

const TYPE_ICONS = new Map<string, IconComponent>([
  ["image", IconImage],
  ["video", IconVideo],
  ["audio", IconMusicNote],
  ["document", IconDocument],
  ["font", IconTypography],
  ["file", IconFile],
  ["link", IconGlobe],
  ["product", IconBagShopping],
  ["text", IconText],
]);

function typeIcon(value: string): ReactNode {
  const Icon = TYPE_ICONS.get(value);
  return Icon ? createElement(Icon) : undefined;
}

export function presetOptions(field: FieldId): Array<FilterOption> {
  const meta = FIELD_META[field];
  if (meta.type === "date") {
    return calendarDateOptions(field);
  }
  if (meta.type === "optional") {
    return [
      {
        label: `With ${meta.label}`,
        predicate: { field, operator: "exists", value: true },
      },
      {
        label: `Without ${meta.label}`,
        predicate: { field, operator: "exists", value: false },
      },
    ];
  }
  if (field === "color") {
    return COLOR_PRESETS.map(({ label, hex }) => ({
      label,
      swatch: hex,
      predicate: { field, operator: "near", value: hex },
    }));
  }
  if (field === "fileCount") {
    return [
      { label: "One File", predicate: { field, operator: "eq", value: 1 } },
      {
        label: "Multiple Files",
        predicate: { field, operator: "gt", value: 1 },
      },
    ];
  }
  if (field === "duration" || field === "fileSize") {
    return (meta.presets ?? []).map(({ id, label, value }) => ({
      label: label.replaceAll(/\b[a-z]/g, (c) => c.toUpperCase()),
      predicate: {
        field,
        operator: id === "longer" || id === "large" ? "gte" : "lt",
        value,
      },
    }));
  }
  return (meta.presets ?? []).map(({ label, value }) => ({
    label: label.replaceAll(/\b[a-z]/g, (c) => c.toUpperCase()),
    icon: field === "type" ? typeIcon(String(value)) : undefined,
    predicate: {
      field,
      operator: meta.type === "stringArray" ? "some" : "eq",
      value:
        meta.type === "stringArray"
          ? Array.isArray(value)
            ? value
            : Choice.safeParse(value).success
              ? [Choice.parse(value)]
              : []
          : value,
    },
  }));
}
