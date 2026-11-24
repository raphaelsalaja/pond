import { IconCopy, IconMagnifier, IconXmark } from "@pond/icons";
import {
  aspectFromDims,
  orientationFromDims,
} from "@pond/schema/filters/fields";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { webTypeKey } from "@pond/schema/media-type";
import type { MenuItemSpec } from "@pond/ui";
import { copyId, copyValue } from "@/features/saves/lib/actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { pickPrimaryFile } from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";

export interface FactAction {
  label: string;
  run: () => void;
}

const MB = 1_000_000;

type SaveTime = Save["savedAt"] | Save["createdAt"] | Save["takenAt"];

interface DateField {
  field: FieldId;
  verb: string;
  at: (save: Save) => SaveTime;
}

const DATE_FIELDS = new Map<string, DateField>([
  ["imported", { field: "savedAt", verb: "from", at: (save) => save.savedAt }],
  [
    "modified",
    {
      field: "modifiedAt",
      verb: "Modified",
      at: (save) => save.createdAt ?? save.savedAt,
    },
  ],
  ["taken", { field: "takenAt", verb: "Taken", at: (save) => save.takenAt }],
]);

function show(label: string, predicate: Predicate): FactAction {
  return { label, run: () => saveLibraryBridge.showMatching(predicate) };
}

function presetLabel(field: FieldId, value: string): string | null {
  return (
    FIELD_META[field].presets?.find((preset) => preset.value === value)
      ?.label ?? null
  );
}

function extensionOf(path: string | undefined): string | null {
  const name = path?.split(/[\\/]/).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot + 1).toLowerCase()
    : null;
}

function dayRange(value: SaveTime): [number, number] | null {
  if (value == null) return null;
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime() - 1];
}

/** Library filters a fact can open, most specific first. */
export function factFilters(
  fact: { id: string; value: string; display: string },
  save: Save,
): FactAction[] {
  switch (fact.id) {
    case "type": {
      const out: FactAction[] = [];
      const extension = extensionOf(pickPrimaryFile(save)?.path);
      if (extension) {
        out.push(
          show(`Show ${fact.value} Saves`, {
            field: "format",
            operator: "some",
            value: [extension],
          }),
        );
      }
      const type =
        save.source === "web"
          ? webTypeKey(save)
          : (save.mediaType ?? "").toLowerCase();
      const typeLabel = presetLabel("type", type);
      if (typeLabel && typeLabel !== fact.value) {
        out.push(
          show(`Show ${typeLabel} Saves`, {
            field: "type",
            operator: "eq",
            value: type,
          }),
        );
      }
      return out;
    }
    case "dimensions": {
      const out: FactAction[] = [];
      const orientation = orientationFromDims(save.width, save.height);
      const orientationLabel = orientation
        ? presetLabel("shape", orientation)
        : null;
      if (orientation && orientationLabel) {
        out.push(
          show(`Show ${orientationLabel} Saves`, {
            field: "shape",
            operator: "eq",
            value: orientation,
          }),
        );
      }
      const aspect = aspectFromDims(save.width, save.height);
      if (aspect) {
        out.push(
          show(`Show ${aspect} Saves`, {
            field: "aspect",
            operator: "eq",
            value: aspect,
          }),
        );
      }
      return out;
    }
    case "size": {
      const size =
        save.fileSize ?? save.files.reduce((sum, file) => sum + file.size, 0);
      if (!size) return [];
      if (size < MB)
        return [
          show("Show Saves Under 1 MB", {
            field: "fileSize",
            operator: "lt",
            value: MB,
          }),
        ];
      if (size < 10 * MB)
        return [
          show("Show Saves Under 10 MB", {
            field: "fileSize",
            operator: "lt",
            value: 10 * MB,
          }),
        ];
      return [
        show("Show Saves Over 10 MB", {
          field: "fileSize",
          operator: "gte",
          value: 10 * MB,
        }),
      ];
    }
    default: {
      const date = DATE_FIELDS.get(fact.id);
      const range = date ? dayRange(date.at(save)) : null;
      if (!date || !range) return [];
      return [
        show(`Show Saves ${date.verb} ${fact.display}`, {
          field: date.field,
          operator: "between",
          value: range,
        }),
      ];
    }
  }
}

export function ratingMenu(
  rating: number,
  setRating: (rating: number) => void,
): MenuItemSpec[] {
  return [
    {
      label: rating ? `Show ${rating}-Star Saves` : "Show Unrated Saves",
      icon: <IconMagnifier />,
      onClick: () =>
        saveLibraryBridge.showMatching({
          field: "rating",
          operator: "eq",
          value: rating,
        }),
    },
    { type: "separator" },
    {
      label: "Clear Rating",
      icon: <IconXmark />,
      disabled: rating === 0,
      onClick: () => setRating(0),
    },
  ];
}

export function copyFact(label: string, value: string): void {
  void (label === "ID" ? copyId(value) : copyValue(label, value)).catch(
    () => undefined,
  );
}

export function factMenu(
  label: string,
  value: string,
  filters: readonly FactAction[],
): MenuItemSpec[] {
  return [
    ...filters.map((filter) => ({
      label: filter.label,
      icon: <IconMagnifier />,
      onClick: filter.run,
    })),
    ...(filters.length > 0 ? [{ type: "separator" as const }] : []),
    {
      label: `Copy ${label}`,
      icon: <IconCopy />,
      onClick: () => copyFact(label, value),
    },
  ];
}
