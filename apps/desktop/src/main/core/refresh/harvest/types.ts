import type { MediaType } from "@pond/schema/db";

export interface ScrapedHarvest {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{
    url: string;
    type?: MediaType;
    poster?: string;
  }>;
  mediaType?: MediaType;
  meta?: Record<string, unknown>;
}

export type {
  ArenaChannel,
  CosmosCluster,
  InstagramMediaItem,
  InstagramMetrics,
  PinterestBoard,
  PinterestMetrics,
  QuotedTweetSummary,
  RawArena,
  RawArticle,
  RawCosmos,
  RawInstagram,
  RawPinterest,
  RawSaveMetadata,
  RawShape,
  RawTikTok,
  RawTwitter,
  RawYoutube,
  RawYtdlp,
  TikTokMetrics,
  TikTokMusic,
  TwitterMediaItem,
  TwitterMetrics,
  YoutubeCaptionTrack,
  YoutubeChapter,
} from "@pond/schema/raw";
