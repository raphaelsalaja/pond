import { z } from "zod";
import { MEDIA_TYPES, SOURCES } from "./db";

export const ingestPayloadSchema = z.object({
  source: z.enum(SOURCES),
  sourceId: z.string().min(1).max(256),
  url: z.string().url(),
  title: z.string().max(500).nullish(),
  description: z.string().max(5000).nullish(),
  author: z.string().max(200).nullish(),
  mediaUrl: z.string().url().nullish(),
  mediaType: z.enum(MEDIA_TYPES).nullish(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  savedAt: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  raw: z.unknown().optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export const ingestResponseSchema = z.object({
  id: z.string().uuid(),
  created: z.boolean(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
