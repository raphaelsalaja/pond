import type { MediaType } from "@pond/schema/db";

/**
 * Lowest common denominator output for any in-page harvester. Mirrors
 * the subset of `IngestPayload` fields the per-source extension
 * scrapers actually fill — the desktop main process pads in `source`,
 * `sourceId`, `url` afterwards.
 */
export interface ScrapedHarvest {
  title?: string;
  description?: string;
  author?: string;
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
