import { z } from "zod";

const ColorSchema = z.string().regex(/^[a-z]+(-[a-z]+)?$/);

/** An app icon tint folder name under `packages/icons/brand/tints`. */
export const PondTintSchema = z
  .string()
  .regex(/^[a-z]+(-[a-z]+)*$/)
  .max(40);

/** The emoji, icon, or Pond logo tint a library logo was drawn from, so the customize dialog can reopen it. */
export const LibraryMarkSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pond"), tint: PondTintSchema }),
  z.object({
    kind: z.literal("emoji"),
    emoji: z.string().min(1).max(32),
    color: ColorSchema,
  }),
  z.object({
    kind: z.literal("icon"),
    icon: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(40),
    color: ColorSchema,
  }),
]);

export type LibraryMarkSource = z.infer<typeof LibraryMarkSourceSchema>;
