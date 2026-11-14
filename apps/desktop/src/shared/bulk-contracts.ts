import { INBOX_STATES } from "@pond/schema/inbox";
import { z } from "zod";

export const BulkEditSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100_000),
  actorReason: z.string().optional(),
  operation: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("tags"),
      tags: z.array(z.string().trim().min(1)),
      mode: z.enum(["add", "replace", "remove"]).optional(),
    }),
    z.object({
      kind: z.literal("rating"),
      rating: z.number().int().min(0).max(5),
    }),
    z.object({
      kind: z.literal("notes"),
      notes: z.string().max(8192).nullable(),
    }),
    z.object({
      kind: z.literal("inbox"),
      state: z.enum(INBOX_STATES),
      /** Epoch ms; required when `state` is `snoozed`. */
      until: z.number().int().positive().optional(),
    }),
    z.object({ kind: z.literal("suggested-tags") }),
    z.object({ kind: z.literal("trash") }),
    z.object({ kind: z.literal("untrash") }),
    z.object({ kind: z.literal("purge") }),
  ]),
});
export type BulkEdit = z.infer<typeof BulkEditSchema>;
export interface BulkQueryInputs {
  "saves.bulkEdit": BulkEdit;
}
export interface BulkQueryResults {
  "saves.bulkEdit": { changed: number };
}
