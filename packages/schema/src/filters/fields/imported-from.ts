import { sql } from "drizzle-orm";
import { saves } from "../../db";
import { IMPORT_ORIGIN_LABELS, IMPORT_ORIGINS } from "../../import-origin";
import { defineField } from "./descriptor";

const IMPORTED_FROM_PRESETS = IMPORT_ORIGINS.map((id) => ({
  id,
  label: IMPORT_ORIGIN_LABELS[id],
  value: id,
}));

export const importedFrom = defineField({
  id: "importedFrom",
  type: "enum",
  label: "Imported From",
  group: "content",
  presets: IMPORTED_FROM_PRESETS,
  project: (s) => s.importedFrom ?? "",
  sqlProjection: () => sql`coalesce(${saves.importedFrom}, '')`,
});
