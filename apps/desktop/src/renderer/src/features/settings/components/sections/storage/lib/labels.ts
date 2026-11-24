import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import { SOURCES, sourceLabel } from "@pond/schema/source-ids";

const KIND_LABELS = new Map([
  ["thumbnail_dark", "Dark Thumbnail"],
  ["source_icon", "Source Icon"],
]);

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function labelForSource(source: string): string {
  const known = SOURCES.find((entry) => entry === source);
  return known ? sourceLabel(known) : source;
}

export function labelForType(type: string): string {
  const preset = FIELD_DESCRIPTORS.type.presets?.find(
    (entry) => entry.value === type,
  );
  return preset?.label ?? titleCase(type);
}

export function labelForKind(kind: string): string {
  return KIND_LABELS.get(kind) ?? titleCase(kind);
}

export function labelForExtension(extension: string): string {
  return extension.toUpperCase();
}

export function formatShare(bytes: number, total: number): string {
  if (total <= 0 || bytes <= 0) {
    return "0%";
  }
  const percent = (bytes / total) * 100;
  return percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}
