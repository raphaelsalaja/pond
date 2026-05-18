import type { Source } from "@pond/schema/db";
import { UnsupportedError } from "./errors";
import { ArenaBlockExtractor } from "./sources/arena-block";
import { CosmosTileExtractor } from "./sources/cosmos-tile";
import { InstagramPostExtractor } from "./sources/instagram-post";
import { PinterestPinExtractor } from "./sources/pinterest-pin";
import { TikTokVideoExtractor } from "./sources/tiktok-video";
import { TwitterTweetExtractor } from "./sources/twitter-tweet";
import { YouTubeWatchExtractor } from "./sources/youtube-watch";
import type { Extractor } from "./types";

export const EXTRACTORS: readonly Extractor[] = [
  new TwitterTweetExtractor(),
  new InstagramPostExtractor(),
  new TikTokVideoExtractor(),
  new YouTubeWatchExtractor(),
  new PinterestPinExtractor(),
  new ArenaBlockExtractor(),
  new CosmosTileExtractor(),
] as const;

export function resolveExtractor(rawUrl: string): Extractor {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsupportedError(`invalid url: ${rawUrl}`);
  }
  for (const ex of EXTRACTORS) {
    if (ex.suitable(url)) return ex;
  }
  throw new UnsupportedError(`no extractor for ${rawUrl}`);
}

export function classifyUrlToSource(rawUrl: string): {
  source: Source | null;
  extractorId: string | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { source: null, extractorId: null };
  }
  for (const ex of EXTRACTORS) {
    if (ex.suitable(url)) {
      return { source: ex.source, extractorId: ex.id };
    }
  }
  return { source: null, extractorId: null };
}

export * from "./errors";
export type {
  Capture,
  CaptureAuthor,
  CaptureMetrics,
  CaptureUpstream,
  ExtractInput,
  MediaCandidate,
  RawJson,
} from "./types";
