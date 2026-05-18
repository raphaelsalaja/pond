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
