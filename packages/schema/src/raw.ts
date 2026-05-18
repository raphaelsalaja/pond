import type { Source } from "./db";

// Raw shapes written into `saves.rawJson`.
//
// Everything flows through the universal `RawJson` below — one
// well-known shape regardless of source — so consumers never have to
// branch on `source` to read a field.
//
// `RawYtdlp` is the only other shape we model directly, because it
// mirrors the upstream yt-dlp JSON dump 1:1; that schema is owned by
// yt-dlp, not us, and we want every field it gives us.

export interface RawYtdlp {
  id?: string;
  title?: string;
  description?: string;
  thumbnail?: string;

  webpage_url?: string;
  original_url?: string;
  extractor?: string;
  extractor_key?: string;

  view_count?: number;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
  repost_count?: number;
  concurrent_view_count?: number;
  average_rating?: number;

  duration?: number;

  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  channel_url?: string;

  upload_date?: string;
  release_date?: string;
  release_timestamp?: number;
  timestamp?: number;

  live_status?: string;
  was_live?: boolean;
  availability?: string;
  age_limit?: number;

  width?: number;
  height?: number;
  fps?: number;
  format_note?: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;

  track?: string;
  artist?: string;
  album?: string;
  genre?: string;
  release_year?: number;

  language?: string;
  tags?: string[];
  categories?: string[];
  chapters?: Array<{
    start_time?: number;
    end_time?: number;
    title?: string;
  }>;

  playlist?: string;
  playlist_id?: string;
  playlist_title?: string;
  playlist_index?: number;
  n_entries?: number;
}

// v1 capture schema — the universal shape written to `saves.rawJson` by
// the URL-first pipeline. Mirrors the `Capture` interface produced by
// `apps/desktop/src/main/core/pipeline/extractors/types.ts` so the
// renderer can read it without depending on main-process code.
export interface CaptureAuthor {
  name?: string;
  handle?: string;
  avatarUrl?: string;
  profileUrl?: string;
  verified?: boolean;
}

export interface CaptureMedia {
  url: string;
  type: "image" | "video" | "link";
  width?: number;
  height?: number;
  durationSec?: number;
  posterUrl?: string;
  mimeType?: string;
}

// Universal superset of public per-item metrics across the supported
// platforms. Each extractor populates the subset its source exposes; the
// renderer iterates over whatever is present.
//
// Mapping per source:
//   twitter   — likes, retweets, replies, views, bookmarks, quotes
//   instagram — likes, comments, plays
//   tiktok    — likes, comments, shares, plays, bookmarks (collects)
//   youtube   — views, likes
//   pinterest — saves, repins, reactions, comments, shares
//   arena     — connections, comments
//   cosmos    — (none publicly exposed)
export interface CaptureMetrics {
  likes?: number;
  views?: number;
  plays?: number;
  comments?: number;
  replies?: number;
  retweets?: number;
  quotes?: number;
  bookmarks?: number;
  shares?: number;
  saves?: number;
  repins?: number;
  reactions?: number;
  connections?: number;
  downloads?: number;
}

export interface CaptureUpstream {
  url: string;
  host: string;
}

export interface Capture {
  id: string;
  source: Source;
  url: string;
  title?: string;
  description?: string;
  author?: CaptureAuthor;
  publishedAt?: string;
  lang?: string;
  media: CaptureMedia[];
  metrics?: CaptureMetrics;
  duration?: number;
  upstream?: CaptureUpstream;
  extras?: Record<string, unknown>;
}

export interface RawJson {
  capture: Capture;
  extractorId: string;
  extractedAt: string;
  ytdlp?: RawYtdlp;
}
