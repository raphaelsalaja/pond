import { z } from "zod/mini";

/** The fields of the Local API Save that the workflow shows; `zod/mini` keeps the script small enough to run on every keystroke. */
const AlfredSaveSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.nullable(z.string()),
  siteName: z.nullable(z.string()),
  source: z.string(),
  tags: z.array(z.string()),
});

export type AlfredSave = z.infer<typeof AlfredSaveSchema>;

/** `/library/search` and `/library/query` with `include: ["saves"]` both answer with `data.saves`. */
export const SavesResponseSchema = z.object({
  data: z.object({ saves: z.array(AlfredSaveSchema) }),
});
