import { webTypeKey } from "@pond/schema/media-type";
import { seededOrderKey } from "@shared/order-key";
import { pickCardFile } from "@shared/save-file-names";
import { saveDuration } from "@/features/saves/media";
import type { Save } from "@/features/saves/types";

export type SortKey =
  | "random"
  | "manual"
  | "savedAt"
  | "createdAt"
  | "publishedAt"
  | "title"
  | "tagName"
  | "tagCount"
  | "duration"
  | "fileSize"
  | "fileCount"
  | "width"
  | "height"
  | "dimensions"
  | "aspectRatio"
  | "creator"
  | "source"
  | "type"
  | "rating";
export type SortDir = "asc" | "desc";

const SORT_KEYS: ReadonlyArray<SortKey> = [
  "random",
  "manual",
  "savedAt",
  "createdAt",
  "publishedAt",
  "title",
  "tagName",
  "tagCount",
  "duration",
  "fileSize",
  "fileCount",
  "width",
  "height",
  "dimensions",
  "aspectRatio",
  "creator",
  "source",
  "type",
  "rating",
];

export function isSortKey(value: string): value is SortKey {
  return SORT_KEYS.some((key) => key === value);
}

export function needsFullPoolHydration(
  empty: boolean,
  useSql: boolean,
  sortKey: SortKey,
  sortDir: SortDir,
): boolean {
  const isDefaultOrder = sortKey === "savedAt" && sortDir === "desc";
  return !((empty && isDefaultOrder) || (!empty && useSql));
}

export function intersectSqlResults(
  saves: ReadonlyArray<Save>,
  sqlIds: ReadonlyArray<string>,
): Array<Save> {
  const byId = new Map(saves.map((save) => [save.id, save]));
  const list: Array<Save> = [];
  for (const id of sqlIds) {
    const save = byId.get(id);
    if (save) {
      list.push(save);
    }
  }
  return list;
}

export function sortSaves(
  saves: ReadonlyArray<Save>,
  key: SortKey,
  dir: SortDir,
): Array<Save> {
  const sign = dir === "asc" ? 1 : -1;
  const out = saves.slice();
  out.sort((a, b) => {
    const aMissing = isMissingSortValue(a, key);
    const bMissing = isMissingSortValue(b, key);
    if (aMissing || bMissing) {
      return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    }
    return sign * cmp(a, b, key);
  });
  return out;
}

function cmp(a: Save, b: Save, key: SortKey): number {
  switch (key) {
    case "random":
      return seededOrderKey(a.id, "pond") - seededOrderKey(b.id, "pond");
    case "manual":
      return 0;
    case "savedAt":
      return savedAtMs(a) - savedAtMs(b);
    case "createdAt":
      return createdAtMs(a) - createdAtMs(b);
    case "publishedAt":
      return nullableNumber(publishedAtMs(a), publishedAtMs(b));
    case "title":
      return titleFor(a).localeCompare(titleFor(b));
    case "tagName":
      return (tagNameFor(a) ?? "").localeCompare(tagNameFor(b) ?? "");
    case "tagCount":
      return a.tags.length - b.tags.length;
    case "duration":
      return nullableNumber(saveDuration(a), saveDuration(b));
    case "fileSize":
      return nullableNumber(sizeFor(a), sizeFor(b));
    case "rating":
      return (a.rating ?? 0) - (b.rating ?? 0);
    case "fileCount":
      return a.files.length - b.files.length;
    case "width":
      return nullableNumber(widthFor(a), widthFor(b));
    case "height":
      return nullableNumber(heightFor(a), heightFor(b));
    case "dimensions":
      return nullableNumber(areaFor(a), areaFor(b));
    case "aspectRatio":
      return nullableNumber(aspectRatioFor(a), aspectRatioFor(b));
    case "creator":
      return textFor(a.author).localeCompare(textFor(b.author));
    case "source":
      return textFor(a.source).localeCompare(textFor(b.source));
    case "type":
      return typeFor(a).localeCompare(typeFor(b));
  }
}

function nullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

function savedAtMs(s: Save): number {
  const t = new Date(s.savedAt).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function createdAtMs(s: Save): number {
  const t = new Date(s.createdAt).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function publishedAtMs(s: Save): number | null {
  const value = s.publishedAt;
  return value !== undefined && value !== null && Number.isFinite(value)
    ? value
    : null;
}

function titleFor(s: Save): string {
  return (s.title ?? s.url ?? "").toLowerCase();
}

function textFor(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function typeFor(s: Save): string {
  if (s.source === "web") {
    return webTypeKey(s);
  }
  return (s.mediaType ?? s.files[0]?.kind ?? "").toLowerCase();
}

function tagNameFor(s: Save): string | null {
  return s.tags.map((tag) => tag.toLowerCase()).sort()[0] ?? null;
}

function sizeFor(s: Save): number | null {
  const cover = pickCardFile(s.files ?? []);
  return cover?.size ?? s.fileSize ?? null;
}

function areaFor(s: Save): number | null {
  const w = widthFor(s);
  const h = heightFor(s);
  if (w === null || h === null) {
    return null;
  }
  return w * h;
}

function widthFor(s: Save): number | null {
  return pickCardFile(s.files ?? [])?.width ?? s.width ?? null;
}

function heightFor(s: Save): number | null {
  return pickCardFile(s.files ?? [])?.height ?? s.height ?? null;
}

function aspectRatioFor(s: Save): number | null {
  const w = widthFor(s);
  const h = heightFor(s);
  if (w === null || h === null || w <= 0 || h <= 0) {
    return null;
  }
  return w / h;
}

function isMissingSortValue(s: Save, key: SortKey): boolean {
  switch (key) {
    case "publishedAt":
      return publishedAtMs(s) === null;
    case "tagName":
      return tagNameFor(s) === null;
    case "duration":
      return saveDuration(s) === null;
    case "fileSize":
      return sizeFor(s) === null;
    case "rating":
      return s.rating === undefined || s.rating === null;
    case "width":
      return widthFor(s) === null;
    case "height":
      return heightFor(s) === null;
    case "dimensions":
      return areaFor(s) === null;
    case "aspectRatio":
      return aspectRatioFor(s) === null;
    default:
      return false;
  }
}
