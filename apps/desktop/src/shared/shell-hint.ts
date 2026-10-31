import { z } from "zod";

/** Theme painted before React mounts so the window never flashes the wrong palette. */
export const ShellHintSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  background: z.string().optional(),
  foreground: z.string().optional(),
  accent: z.string().optional(),
  contrast: z.number().optional(),
});

export type ShellHint = z.infer<typeof ShellHintSchema>;

export const SHELL_HINT_ARG = "--pond-shell=";
