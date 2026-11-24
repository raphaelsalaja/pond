import { QuerySchema } from "@pond/schema/filters";
import { z } from "zod";

/** Hand-written links like `/?q=2024` arrive JSON-parsed, so a numeric value is still text. */
const text = z
  .union([z.string(), z.number()])
  .transform(String)
  .optional()
  .catch(undefined);

/** Search params every Library route shares: the open Save and what narrows the grid. */
export const librarySearchSchema = z.looseObject({
  save: text,
  q: text,
  filters: QuerySchema.optional().catch(undefined),
  semantic: text,
  sort: z.string().optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  scope: z.literal("all").optional().catch(undefined),
});

export type LibrarySearch = z.infer<typeof librarySearchSchema>;

/** Query-string forms older builds and the main process used before collections had paths. */
export const legacyIndexSearchSchema = z.looseObject({
  folder: text,
  view: text,
  inbox: z.unknown().optional(),
});
