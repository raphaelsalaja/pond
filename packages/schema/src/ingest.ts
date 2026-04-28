import { z } from "zod";
import { MEDIA_TYPES, SOURCES } from "./db";

/**
 * One piece of media attached to a save. Used for carousels / multi-photo
 * tweets / IG albums. Typing is deliberately loose (no URL validation on
 * `poster`) because scrapers sometimes emit blob:/data: URLs for videos.
 */
export const ingestMediaSchema = z.object({
  url: z.string().url(),
  /** Optional preview / video poster. Written as a sibling `poster-*.jpg`. */
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
  /** Legacy single-media field. Kept so old extension builds still work. */
  mediaUrl: z.string().url().nullish(),
  /**
   * New multi-media field. First entry becomes the cover. Scrapers should
   * populate every image / video they see; the server dedups identical URLs.
   * Capped at 24 to cover the largest carousels without DoSing the writer.
   */
  mediaUrls: z.array(ingestMediaSchema).max(24).optional(),
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
  id: z.string().min(1),
  created: z.boolean(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
