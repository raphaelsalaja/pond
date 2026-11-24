import type { ListKind } from "@pond/schema/list-kinds";

export interface ExportEntry {
  url: string;
  listKind: ListKind;
  savedAt: Date | null;
  /** A playlist or collection name, filed as a Pond folder. */
  folder?: string;
}

export interface ExportParser {
  id: "x" | "instagram" | "tiktok" | "youtube" | "reddit";
  label: string;
  matches: (path: string) => boolean;
  parse: (path: string, text: string) => Array<ExportEntry>;
}
