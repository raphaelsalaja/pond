import type { MediaType } from "@pond/schema/db";

/**
 * Lowest common denominator output for any in-page harvester. Mirrors
 * the subset of `IngestPayload` fields the per-source extension
 * scrapers actually fill — the desktop main process pads in `source`,
 * `sourceId`, `url` afterwards.
 *
 * @see ./CAPTURE-STANDARD.md — when adding or expanding a harvester,
 *      walk the wishlist there before shipping. Source-agnostic fields
 *      go on `ScrapedHarvest` directly; everything platform-specific
 *      lands on `meta` and rides through to `raw.<source>` on the save.
 */
export interface ScrapedHarvest {
  title?: string;
  description?: string;
  /** Author handle (e.g. `@vercel`). Display name lives on `meta`. */
  author?: string;
  /** BCP-47 language tag for the body text (e.g. `en`). */
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{
    url: string;
    type?: MediaType;
    poster?: string;
  }>;
  mediaType?: MediaType;
  /** Source-specific blob stashed under `raw.<source>`. */
  meta?: Record<string, unknown>;
}

/**
 * Per-source `raw.<source>` shapes live in `@pond/schema/raw` so the
 * renderer can read them too (Drizzle keeps us out of `@pond/schema/db`
 * from the renderer side, but a pure types file is fine).
 *
 * Re-exported here for backwards compatibility with the existing
 * harvest/og/auto-video import paths — new code should import directly
 * from `@pond/schema/raw`.
 */
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
  RawReddit,
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
