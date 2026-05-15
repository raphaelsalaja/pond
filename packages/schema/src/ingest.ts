import { z } from "zod";
import { MEDIA_TYPES, SOURCES } from "./db";

export const ingestMediaSchema = z.object({
  url: z.string().url(),
  poster: z.string().optional(),
  type: z.enum(MEDIA_TYPES).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type IngestMedia = z.infer<typeof ingestMediaSchema>;

export const ingestPayloadSchema = z.object({
  source: z.enum(SOURCES),
  sourceId: z.string().min(1).max(256),
  url: z.string().url(),
  title: z.string().max(500).nullish(),
  description: z.string().max(5000).nullish(),
  author: z.string().max(200).nullish(),
  lang: z.string().max(35).nullish(),
  siteName: z.string().max(120).nullish(),
  publishedAt: z
    .string()
    .datetime()
    .nullish()
    .transform((v) => (v ? new Date(v) : undefined))
    .optional(),
  mediaUrl: z.string().url().nullish(),
  mediaUrls: z.array(ingestMediaSchema).max(24).optional(),
  mediaType: z.enum(MEDIA_TYPES).nullish(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  savedAt: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .optional(),
  raw: z.unknown().optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export const ingestResponseSchema = z.object({
  id: z.string().min(1),
  created: z.boolean(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
