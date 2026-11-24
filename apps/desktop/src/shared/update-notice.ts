import { z } from "zod";

export const UpdateNoticeSchema = z.discriminatedUnion("phase", [
  z.strictObject({
    phase: z.literal("available"),
    version: z.string().min(1),
    downloading: z.boolean(),
    /** Absent until the first chunk lands. */
    progress: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    phase: z.literal("downloaded"),
    version: z.string().min(1),
  }),
]);

export type UpdateNotice = z.infer<typeof UpdateNoticeSchema>;
export type UpdateNoticeInput = z.input<typeof UpdateNoticeSchema>;
