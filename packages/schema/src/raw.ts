import type { Source } from "./db";

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

export interface TwitterMediaItem {
  url: string;
  type: "image" | "video" | "gif";
  altText?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  poster?: string;
}

export interface TwitterMetrics {
  likes?: number;
  retweets?: number;
  replies?: number;
  views?: number;
  bookmarks?: number;
}

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
  bookmarkedAt?: string;
  ytdlp?: RawYtdlp;
}

export interface InstagramMetrics {
  likes?: number;
  comments?: number;
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
  isPaidPartnership?: boolean;
  location?: string;
  ytdlp?: RawYtdlp;
}

export interface PinterestMetrics {
  repins?: number;
  comments?: number;
  reactions?: number;
  saves?: number;
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
  domain?: string;
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
  blockClass?: string;
  channels?: ArenaChannel[];
  metrics?: {
    connections?: number;
    comments?: number;
  };
  sourceUrl?: string;
  attachmentUrl?: string;
  embedUrl?: string;
  content?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageVariants?: {
    original?: string;
    large?: string;
    display?: string;
    thumb?: string;
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
  kind?: string;
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

export interface RawSaveMetadata {
  twitter?: RawTwitter;
  instagram?: RawInstagram;
  pinterest?: RawPinterest;
  arena?: RawArena;
  cosmos?: RawCosmos;
  tiktok?: RawTikTok;
  youtube?: RawYoutube;
  article?: RawArticle;

  kind?: string;
  capturedAt?: string;

  [key: string]: unknown;
}

export type RawShape = Source;
