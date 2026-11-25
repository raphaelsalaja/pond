import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export const LIST_COLUMN_OPTIONS = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "source", label: "Source" },
  { key: "creator", label: "Creator" },
  { key: "tags", label: "Tags" },
  { key: "dimensions", label: "Dimensions" },
  { key: "duration", label: "Duration" },
  { key: "rating", label: "Rating" },
  { key: "extension", label: "Extension" },
  { key: "fileSize", label: "File Size" },
  { key: "dateAdded", label: "Date Added" },
  { key: "datePublished", label: "Date Published" },
  { key: "annotation", label: "Annotation" },
] as const;

export type ListColumnKey = (typeof LIST_COLUMN_OPTIONS)[number]["key"];

export type ListColumns = { [Key in ListColumnKey]: boolean };

export const LIST_COLUMN_DEFAULTS: ListColumns = {
  name: true,
  type: true,
  source: true,
  creator: false,
  tags: false,
  dimensions: false,
  duration: false,
  rating: false,
  extension: false,
  fileSize: true,
  dateAdded: true,
  datePublished: false,
  annotation: false,
};

function readKey(key: ListColumnKey): boolean {
  if (!globalThis.window) return LIST_COLUMN_DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(`pond.list.${key}`);
    if (raw === null) {
      return LIST_COLUMN_DEFAULTS[key];
    }
    return raw === "1";
  } catch {
    return LIST_COLUMN_DEFAULTS[key];
  }
}

function readAll(): ListColumns {
  const columns = { ...LIST_COLUMN_DEFAULTS };
  for (const { key } of LIST_COLUMN_OPTIONS) columns[key] = readKey(key);
  return columns;
}

const store = new Store<ListColumns>(readAll());

export function setListColumn(key: ListColumnKey, value: boolean): void {
  if (globalThis.window) {
    try {
      window.localStorage.setItem(`pond.list.${key}`, value ? "1" : "0");
    } catch {
      /** Storage can be full or blocked; the column still applies for this session. */
    }
  }
  store.setState((s) => (s[key] === value ? s : { ...s, [key]: value }));
}

export function useListColumns(): ListColumns {
  return useSelector(store, (s) => s);
}

export function formatListDimension(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (!width || !height) return "—";
  return `${width} × ${height}`;
}

export function formatListRating(rating: number | null | undefined): string {
  if (rating === undefined || rating === null || rating <= 0) {
    return "—";
  }
  return String(rating);
}

export function formatListExtension(path: string | null | undefined): string {
  if (!path) return "—";
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "—";
  return path.slice(dot + 1).toUpperCase();
}
