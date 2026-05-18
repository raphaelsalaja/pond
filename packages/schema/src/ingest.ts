import { z } from "zod";

// HTTP enqueue contract — the only thing the extension and the desktop
// app exchange when adding a save. The pipeline derives everything else
// (title, media, metrics, raw json…) from the URL alone, on the
// desktop side, via the extractors in `core/pipeline`.

export const enqueueRequestSchema = z.object({
  url: z.string().url(),
  trigger: z.string().max(64).optional(),
});

export type EnqueueRequest = z.infer<typeof enqueueRequestSchema>;

export const enqueueResponseSchema = z.object({
  id: z.string().min(1),
  created: z.boolean(),
});

export type EnqueueResponse = z.infer<typeof enqueueResponseSchema>;
