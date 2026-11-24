import { sql } from "drizzle-orm";
import { z } from "zod";
import { saves } from "../../db";
import { defineField } from "./descriptor";

const FilePath = z.object({ path: z.string() });

export function fileExtension(path: string): string | null {
  const name = path.split(/[\\/]/).at(-1)?.split(/[?#]/, 1)[0] ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return null;
  }
  return name.slice(dot + 1).toLowerCase();
}

export const format = defineField({
  id: "format",
  type: "stringArray",
  label: "Format",
  group: "media",
  comparators: ["some", "every", "none", "empty"],
  project: (save) => [
    ...new Set(
      (save.files ?? [])
        .map((file) => {
          const parsed = FilePath.safeParse(file);
          return parsed.success ? fileExtension(parsed.data.path) : null;
        })
        .filter((value): value is string => value !== null),
    ),
  ],
  sqlProjection: () => sql`${saves.files}`,
});
