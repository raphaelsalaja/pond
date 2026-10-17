import { z } from "zod";
import { SOURCES } from "./db";
import type { RawJson } from "./raw";

const CaptureAuthorSchema = z.object({
  name: z.string().optional(),
  handle: z.string().optional(),
  avatarUrl: z.string().optional(),
  profileUrl: z.string().optional(),
  verified: z.boolean().optional(),
});

const CaptureMediaSchema = z.object({
  url: z.string(),
  type: z.enum(["image", "video", "link"]),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  posterUrl: z.string().optional(),
  mimeType: z.string().optional(),
});

const CaptureMetricsSchema = z.object({
  likes: z.number().optional(),
  views: z.number().optional(),
  plays: z.number().optional(),
  comments: z.number().optional(),
  replies: z.number().optional(),
  retweets: z.number().optional(),
  quotes: z.number().optional(),
  bookmarks: z.number().optional(),
  shares: z.number().optional(),
  saves: z.number().optional(),
  repins: z.number().optional(),
  reactions: z.number().optional(),
  connections: z.number().optional(),
  downloads: z.number().optional(),
});

const CaptureLinkCardSchema = z.object({
  url: z.string().optional(),
  domain: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  large: z.boolean().optional(),
});

export const CaptureSchema = z.object({
  id: z.string(),
  source: z.enum(SOURCES),
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  author: CaptureAuthorSchema.optional(),
  publishedAt: z.string().optional(),
  lang: z.string().optional(),
  media: z.array(CaptureMediaSchema).default([]),
  metrics: CaptureMetricsSchema.optional(),
  duration: z.number().optional(),
  upstream: z.object({ url: z.string(), host: z.string() }).optional(),
  get quoted() {
    return CaptureSchema.optional();
  },
  get replyTo() {
    return CaptureSchema.optional();
  },
  card: CaptureLinkCardSchema.optional(),
  isReply: z.boolean().optional(),
  replyingTo: z.string().optional(),
  conversationId: z.string().optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

const text = z.string().optional().catch(undefined);
const count = z.number().optional().catch(undefined);

export const RawYtdlpSchema = z.object({
  id: text,
  title: text,
  description: text,
  thumbnail: text,
  webpage_url: text,
  original_url: text,
  extractor: text,
  extractor_key: text,
  view_count: count,
  like_count: count,
  dislike_count: count,
  comment_count: count,
  repost_count: count,
  concurrent_view_count: count,
  average_rating: count,
  duration: count,
  uploader: text,
  uploader_id: text,
  uploader_url: text,
  channel: text,
  channel_id: text,
  channel_url: text,
  upload_date: text,
  release_date: text,
  release_timestamp: count,
  timestamp: count,
  live_status: text,
  was_live: z.boolean().optional().catch(undefined),
  availability: text,
  age_limit: count,
  width: count,
  height: count,
  fps: count,
  format_note: text,
  vcodec: text,
  acodec: text,
  filesize: count,
  filesize_approx: count,
  tbr: count,
  track: text,
  artist: text,
  album: text,
  genre: text,
  release_year: count,
  language: text,
  tags: z.array(z.string()).optional().catch(undefined),
  categories: z.array(z.string()).optional().catch(undefined),
  chapters: z
    .array(
      z.object({
        start_time: count,
        end_time: count,
        title: text,
      }),
    )
    .optional()
    .catch(undefined),
  playlist: text,
  playlist_id: text,
  playlist_title: text,
  playlist_index: z.coerce.number().optional().catch(undefined),
  n_entries: count,
});

export const RawJsonSchema = z.object({
  capture: CaptureSchema,
  extractorId: z.string(),
  extractedAt: z.string(),
  ytdlp: z.looseObject({}).optional(),
  captureTweetVersion: z.number().optional(),
  renderTextCoverVersion: z.number().optional(),
  importFilter: z.enum(["media", "since"]).optional().catch(undefined),
});

/**
 * What `raw_json` and `source.json` hold at rest: every part is optional.
 * @remarks yt-dlp records a video before any capture exists, so a full `RawJson` is not guaranteed.
 */
export const StoredRawJsonSchema = z.object({
  capture: CaptureSchema.partial().default({}),
  extractorId: z.string().optional(),
  extractedAt: z.string().optional(),
  ytdlp: z.looseObject({ duration: z.number().optional() }).optional(),
  captureTweetVersion: z.number().optional(),
  renderTextCoverVersion: z.number().optional(),
  importFilter: z.enum(["media", "since"]).optional().catch(undefined),
});

export type StoredRawJson = z.infer<typeof StoredRawJsonSchema>;
export type StoredRawJsonInput = z.input<typeof StoredRawJsonSchema>;

export function storedAsRawJson(stored: StoredRawJsonInput): RawJson {
  /** SAFETY: the stored shape is `RawJson` with the gaps above, and every reader uses optional chaining. */
  return stored as RawJson;
}
