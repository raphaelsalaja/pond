import type { Source } from "./db";

/** Mirrors yt-dlp's JSON dump 1:1; written into `saves.rawJson`. */
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

export interface CaptureLinkCard {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  large?: boolean;
}

export const QUOTE_DEPTH_CAP = 3;

export interface CaptureExtras {
  blockClass?: string;
  board?: { name?: string; url: string };
  clusters?: unknown;
  dominantColor?: string;
  externalLink?: string;
  faviconUrl?: string;
  publisher?: string;
  replyParentUnavailable?: boolean;
  replyRecaptureQueued?: boolean;
  subreddit?: string;
  tileType?: string;
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
  quoted?: Capture;
  replyTo?: Capture;
  card?: CaptureLinkCard;
  isReply?: boolean;
  replyingTo?: string;
  conversationId?: string;
  extras?: CaptureExtras;
}

export interface RawJson {
  capture: Capture;
  extractorId: string;
  extractedAt: string;
  ytdlp?: RawYtdlp;
  captureTweetVersion?: number;
  renderTextCoverVersion?: number;
  /** Set when the Account's import filters skipped this save, so a scope change can release it. */
  importFilter?: "media" | "since";
}

export function walkCaptureMedia(
  capture: Capture | undefined | null,
): CaptureMedia[] {
  if (!capture) return [];
  const out: CaptureMedia[] = [];
  const seen = new Set<string>();
  const pending: Capture[] = [capture];
  let depth = 0;
  while (pending.length > 0 && depth <= QUOTE_DEPTH_CAP) {
    const level = pending.splice(0, pending.length);
    depth += 1;
    for (const current of level) {
      for (const m of current.media ?? []) {
        if (seen.has(m.url)) continue;
        seen.add(m.url);
        out.push(m);
      }
      if (current.quoted) pending.push(current.quoted);
      if (current.replyTo) pending.push(current.replyTo);
    }
  }
  return out;
}
