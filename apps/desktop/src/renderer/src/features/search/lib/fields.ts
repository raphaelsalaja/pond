import {
  IconCircleUser as Account,
  IconAperture as ApertureIcon,
  IconGridLayoutRows as AspectIcon,
  IconCalendarCheck as CalendarCheck,
  IconCalendarDate as CalendarDate,
  IconCalendarPen as CalendarPen,
  IconCalendarPlus as CalendarPlus,
  IconCamera as CameraMakeIcon,
  IconCamera2 as CameraModelIcon,
  IconChatBubble as Caption,
  IconFile as FileIcon,
  IconCopy as FilesIcon,
  IconFocus as FocalLengthIcon,
  IconFolder as FolderIcon,
  IconSpellCheck as FontActivatedIcon,
  IconDesignFile as FormatIcon,
  IconHeading1 as Heading,
  IconVector as HeightIcon,
  IconDownload as ImportIcon,
  IconEyeLens as LensIcon,
  IconLink2 as LinkIcon,
  IconListFavs as ListIcon,
  IconMicrophone as Mic,
  IconMusic as Music,
  IconGridLayoutCols as OrientationIcon,
  IconPalette as Palette,
  IconPencil as Pencil,
  IconShieldCheck as SafetyIcon,
  IconCameraSparkle as SensitivityIcon,
  IconServer as SizeIcon,
  IconStar as Star,
  IconBookmark as Tag,
  IconText as TextIcon,
  IconStopwatch as Timer,
  IconGlobe as UrlIcon,
  IconUser as User,
  IconImage as WidthIcon,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { COLOR_PRESETS, readColorMatch } from "@pond/schema/filters/color";
import { FIELD_META } from "@pond/schema/filters/meta";
import type {
  ComparatorId,
  FieldId,
  Predicate,
} from "@pond/schema/filters/types";
import { accountChipLabel } from "@/features/search/lib/account-aliases";
import { DATE_PRESETS, serializePredicate } from "@/features/search/lib/syntax";

const orientationField = "shape";
const FIELD_ICONS = {
  title: Heading,
  tags: Tag,
  folder: FolderIcon,
  list: ListIcon,
  source: LinkIcon,
  importedFrom: ImportIcon,
  type: FileIcon,
  format: FormatIcon,
  fileCount: FilesIcon,
  duration: Timer,
  fontFamily: TextIcon,
  fontActivated: FontActivatedIcon,
  bpm: Music,
  cameraMake: CameraMakeIcon,
  cameraModel: CameraModelIcon,
  lensModel: LensIcon,
  focalLength: FocalLengthIcon,
  aperture: ApertureIcon,
  iso: SensitivityIcon,
  [orientationField]: OrientationIcon,
  aspect: AspectIcon,
  creator: User,
  account: Account,
  note: Pencil,
  caption: Caption,
  transcript: Mic,
  sensitiveContent: SafetyIcon,
  color: Palette,
  savedAt: CalendarPlus,
  publishedAt: CalendarCheck,
  modifiedAt: CalendarPen,
  takenAt: CalendarDate,
  rating: Star,
  fileSize: SizeIcon,
  width: WidthIcon,
  height: HeightIcon,
  url: UrlIcon,
} satisfies Record<FieldId, IconComponent>;
export function fieldIcon(field: FieldId): IconComponent {
  return FIELD_ICONS[field];
}

const COMPARATOR_SYMBOL = new Map<ComparatorId, string>([
  ["gt", ">"],
  ["gte", "≥"],
  ["lt", "<"],
  ["lte", "≤"],
  ["neq", "≠"],
]);

interface PredicateChip {
  icon: IconComponent;
  label: string;
  title: string;
  swatch?: string;
  negated: boolean;
}

function dateLabel(iso: string): string {
  const preset = DATE_PRESETS.find((d) => d.iso === iso);
  return preset ? preset.label : iso;
}

function isDatePreset(iso: string): boolean {
  return DATE_PRESETS.some((d) => d.iso === iso);
}

function shortDateField(field: FieldId): string {
  return FIELD_META[field].label.replace(/^Date\s+/i, "");
}

export function describePredicate(predicate: Predicate): PredicateChip {
  const { field, operator, value } = predicate;
  const meta = FIELD_META[field];
  const icon = FIELD_ICONS[field];
  const title = serializePredicate(predicate) ?? meta.label;

  const base: Omit<PredicateChip, "label" | "negated"> & {
    label?: string;
    negated?: boolean;
  } = { icon, title };

  switch (meta.type) {
    case "enum": {
      const negated = operator === "neq" || operator === "nin";
      const list = (Array.isArray(value) ? value : [value]).map((v) =>
        field === "account" ? accountChipLabel(String(v)) : String(v),
      );
      return { ...base, label: list.join(", "), negated };
    }
    case "stringArray": {
      const negated = operator === "none";
      const list = (Array.isArray(value) ? value : [value]).map((v) => {
        const preset = meta.presets?.find((p) => String(p.value) === String(v));
        return preset?.label ?? String(v);
      });
      return { ...base, label: list.join(", "), negated };
    }
    case "optional": {
      if (operator === "contains")
        return {
          ...base,
          label: `${meta.label}: ${String(value)}`,
          negated: false,
        };
      const has = value !== false;
      const noun = meta.label.toLowerCase();
      return {
        ...base,
        label: has ? `has ${noun}` : `no ${noun}`,
        negated: !has,
      };
    }
    case "color": {
      const hex = readColorMatch(value)?.hex ?? "";
      const preset = COLOR_PRESETS.find(
        (c) => c.hex.toLowerCase() === hex.toLowerCase(),
      );
      return {
        ...base,
        label: preset ? preset.label : hex,
        swatch: hex,
        negated: Boolean(predicate.negate),
      };
    }
    case "number": {
      if (operator === "between" && Array.isArray(value)) {
        return { ...base, label: `${value[0]}–${value[1]}`, negated: false };
      }
      const sym = COMPARATOR_SYMBOL.get(operator);
      return {
        ...base,
        label: sym ? `${sym} ${value}` : String(value),
        negated: operator === "neq",
      };
    }
    case "date": {
      const name = shortDateField(field);
      if (operator === "between" && Array.isArray(value)) {
        return {
          ...base,
          label: `${name} · ${dateLabel(String(value[0] ?? ""))}–${dateLabel(String(value[1] ?? ""))}`,
          negated: false,
        };
      }
      const iso = String(value ?? "");
      const sym = COMPARATOR_SYMBOL.get(operator);
      const text = dateLabel(iso);
      const valuePart =
        sym && !(operator === "gte" && isDatePreset(iso))
          ? `${sym} ${text}`
          : text;
      return {
        ...base,
        label: `${name} · ${valuePart}`,
        negated: false,
      };
    }
    default:
      return { ...base, label: String(value ?? ""), negated: false };
  }
}
