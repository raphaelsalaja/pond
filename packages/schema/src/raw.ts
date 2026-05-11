import type { Source } from "./db";

/**
 * Typed shapes of `saves.rawJson` keyed by `Source`. The harvesters
 * (browser extension content scripts, desktop hidden-window scrapers,
 * server-side OG reader) all write into `raw.<source>` per the
 * `CAPTURE-STANDARD.md` contract. We surface those shapes here so both
 * the main process and the renderer can read them safely without
 * stringly typing every access.
 *
 * Two design rules:
 *
 * 1. **Additive only.** Never rename or remove a field — older saves
 *    on disk carry the previous shape forever. New fields go on as
 *    `?: T` so deserialisation never throws.
 * 2. **Pure types.** No runtime imports. The renderer can pick this
 *    file up via `@pond/schema/raw` even though it can't touch
 *    `@pond/schema/db` (Drizzle pulls in pg-core / sqlite-core which
 *    transitively reach Node-only modules).
 */

/**
 * Curated subset of yt-dlp's `--write-info-json` payload, lifted into
 * `raw.<source>.ytdlp` whenever the bundled binary downloads bytes
 * (see [yt-dlp.ts](apps/desktop/src/main/core/refresh/yt-dlp.ts)). yt-dlp
 * dumps a far larger blob (per-format ladders, full extractor envelope,
 * etc.); we only persist the cheap, display-relevant scalars.
 *
 * All fields optional — extractor coverage varies wildly per site.
 */
export interface RawYtdlp {
  id?: string;
  title?: string;
  description?: string;
  thumbnail?: string;

  /** Final landing URL after extractor redirects. */
  webpage_url?: string;
  /** URL we actually handed to yt-dlp. */
  original_url?: string;
  /** Pretty extractor name (`youtube`, `twitter:status`, …). */
  extractor?: string;
  extractor_key?: string;

  /** Engagement metrics — same field names yt-dlp emits. */
  view_count?: number;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
  repost_count?: number;
  concurrent_view_count?: number;
  average_rating?: number;

  /** Seconds; rounded by yt-dlp on most sites. */
  duration?: number;

  /** Uploader / channel. yt-dlp distinguishes the two on YouTube. */
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  channel_url?: string;

  /** Date strings: `YYYYMMDD`. Use `release_timestamp` (unix s) for
   * precise ordering. */
  upload_date?: string;
  release_date?: string;
  release_timestamp?: number;
  /** `extractor_get_info_dict()` fallback timestamp (unix s). */
  timestamp?: number;

  /** Stream / live state. */
  live_status?: string;
  was_live?: boolean;
  availability?: string;
  age_limit?: number;

  /** Playable format hints — useful for diagnosing playback bugs. */
  width?: number;
  height?: number;
  fps?: number;
  format_note?: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;

  /** Music-video metadata (YouTube auto-fills these on official VEVO etc.) */
  track?: string;
  artist?: string;
  album?: string;
  genre?: string;
  release_year?: number;

  /** Misc free-form classifiers. */
  language?: string;
  tags?: string[];
  categories?: string[];
  chapters?: Array<{
    start_time?: number;
    end_time?: number;
    title?: string;
  }>;

  /** Playlist context when yt-dlp was given a playlist URL. */
  playlist?: string;
  playlist_id?: string;
  playlist_title?: string;
  playlist_index?: number;
  n_entries?: number;
}

/**
 * Per-image / per-video extras the Twitter harvester captures. Keyed by
 * the cover URL stored in `mediaUrls`, so the renderer can join when
 * it wants to render alt text or duration without having to walk a
 * parallel array.
 */
export interface TwitterMediaItem {
  url: string;
  type: "image" | "video" | "gif";
  altText?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  poster?: string;
}

/**
 * Engagement counters Twitter exposes via `aria-label="N Likes"` etc.
 * Stored as numbers (already parsed from the localised text) so the
 * renderer can sum / compare without re-parsing.
 */
export interface TwitterMetrics {
  likes?: number;
  retweets?: number;
  replies?: number;
  views?: number;
  bookmarks?: number;
}

/**
 * Compact summary of a quote-tweeted post. We don't try to capture the
 * full quoted-tweet payload (that would require a second navigation);
 * just enough that the card renders a "Quote of @x: …" chip.
 */
export interface QuotedTweetSummary {
  tweetId?: string;
  author?: string;
  authorName?: string;
  text?: string;
  url?: string;
}

export interface RawTwitter {
  authorName?: string;
  authorAvatar?: string;
  authorUrl?: string;
  verified?: boolean;
  publishedAt?: string;
  lang?: string;
  conversationId?: string;
  isReply?: boolean;
  isQuote?: boolean;
  isThreadRoot?: boolean;
  quotedTweet?: QuotedTweetSummary;
  metrics?: TwitterMetrics;
  media?: TwitterMediaItem[];
  /** ISO timestamp the bookmarks-list scrape recorded for this tweet. */
  bookmarkedAt?: string;
  /** yt-dlp sidecar for tweets that contained downloadable video. */
  ytdlp?: RawYtdlp;
}

export interface InstagramMetrics {
  likes?: number;
  comments?: number;
  /** Reels only. */
  plays?: number;
}

export interface InstagramMediaItem {
  url: string;
  type: "image" | "video";
  altText?: string;
  durationSec?: number;
  videoUrl?: string;
}

export interface RawInstagram {
  authorName?: string;
  authorAvatar?: string;
  authorUrl?: string;
  verified?: boolean;
  publishedAt?: string;
  lang?: string;
  metrics?: InstagramMetrics;
  media?: InstagramMediaItem[];
  /** Sponsored / branded-content flag (`node.is_paid_partnership`). */
  isPaidPartnership?: boolean;
  /** Location tag display name when authored. */
  location?: string;
  ytdlp?: RawYtdlp;
}

export interface PinterestMetrics {
  repins?: number;
  comments?: number;
}

export interface PinterestBoard {
  id?: string;
  name?: string;
  url?: string;
}

export interface RawPinterest {
  authorName?: string;
  authorAvatar?: string;
  authorUrl?: string;
  publishedAt?: string;
  metrics?: PinterestMetrics;
  board?: PinterestBoard;
  /** Original-source domain (`pinData.domain`). */
  domain?: string;
  /** Recipe / product / article rich summary block. */
  richSummary?: Record<string, unknown>;
  ytdlp?: RawYtdlp;
}

export interface ArenaChannel {
  id?: string;
  title?: string;
  slug?: string;
  href?: string;
}

export interface RawArena {
  authorName?: string;
  authorAvatar?: string;
  authorUrl?: string;
  authorSlug?: string;
  publishedAt?: string;
  /** `Image`, `Media`, `Link`, `Text`, `Attachment`. */
  blockClass?: string;
  channels?: ArenaChannel[];
  metrics?: {
    connections?: number;
    comments?: number;
  };
  ytdlp?: RawYtdlp;
}

export interface CosmosCluster {
  id: string;
  title?: string;
}

export interface RawCosmos {
  authorName?: string;
  authorUrl?: string;
  publishedAt?: string;
  upstreamUrl?: string;
  clusters?: CosmosCluster[];
  ytdlp?: RawYtdlp;
}

export interface TikTokMetrics {
  plays?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  downloads?: number;
}

export interface TikTokMusic {
  title?: string;
  author?: string;
  id?: string;
}

export interface RawTikTok {
  authorName?: string;
  authorAvatar?: string;
  authorHandle?: string;
  publishedAt?: string;
  durationSec?: number;
  metrics?: TikTokMetrics;
  music?: TikTokMusic;
  ytdlp?: RawYtdlp;
}

export interface YoutubeChapter {
  title: string;
  startSec: number;
}

export interface YoutubeCaptionTrack {
  lang: string;
  name?: string;
  vssId?: string;
}

export interface RawYoutube {
  channelId?: string;
  channelName?: string;
  channelUrl?: string;
  publishedAt?: string;
  durationSec?: number;
  metrics?: {
    views?: number;
    likes?: number;
  };
  shortDescription?: string;
  keywords?: string[];
  chapters?: YoutubeChapter[];
  captions?: YoutubeCaptionTrack[];
  /** `watch-later` | `playlist` | `like` — list-harvest context. */
  kind?: string;
  ytdlp?: RawYtdlp;
}

export interface RawReddit {
  authorName?: string;
  authorUrl?: string;
  subreddit?: string;
  publishedAt?: string;
  metrics?: {
    upvotes?: number;
    comments?: number;
    awards?: number;
  };
  ytdlp?: RawYtdlp;
}

export interface RawArticle {
  siteName?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  lang?: string;
  keywords?: string[];
  feedUrl?: string;
  ytdlp?: RawYtdlp;
}

/**
 * Shape of the `saves.rawJson` blob. Keys match the `Source` enum so
 * the harvester writes its payload under `raw.<source>` and the
 * renderer reads with the matching key. Unknown / future keys are
 * permitted via the index signature so deserialising older or newer
 * saves never throws.
 *
 * Convenience root-level fields (`kind`, `capturedAt`) stay typed
 * because the in-app refresh path attaches them at line 148 of
 * [`refresh/index.ts`](apps/desktop/src/main/core/refresh/index.ts).
 */
export interface RawSaveMetadata {
  twitter?: RawTwitter;
  instagram?: RawInstagram;
  pinterest?: RawPinterest;
  arena?: RawArena;
  cosmos?: RawCosmos;
  tiktok?: RawTikTok;
  youtube?: RawYoutube;
  reddit?: RawReddit;
  article?: RawArticle;

  kind?: string;
  capturedAt?: string;

  /** Open extension point — extractor envelopes, debug tags, etc. */
  [key: string]: unknown;
}

/** Compile-time guard: every `Source` should eventually have a typed `RawXxx`. */
export type RawShape = Source;
