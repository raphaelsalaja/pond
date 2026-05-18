import type { Source } from "@pond/schema/db";
import {
  ARENA_PATTERNS,
  firstMatch,
  INSTAGRAM_PATTERNS,
  PINTEREST_PATTERNS,
  TIKTOK_PATTERNS,
  TWITTER_PATTERNS,
  YOUTUBE_PATTERNS,
} from "./extractors/url-patterns";

// sourceIdFromUrl — canonical id used in `saves.source_id`. Matches the
// extractor's regex capture so a given (source, sourceId) pair is unique per
// post regardless of which URL form the user pasted in.
export function sourceIdFromUrl(source: Source, rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  switch (source) {
    case "twitter": {
      const m = firstMatch(url, TWITTER_PATTERNS);
      return m?.[1] ?? null;
    }
    case "instagram": {
      const m = firstMatch(url, INSTAGRAM_PATTERNS);
      return m?.[1] ?? null;
    }
    case "pinterest": {
      const m = firstMatch(url, PINTEREST_PATTERNS);
      // pin.it short link: no numeric id without a follow; use the slug.
      return m?.[1] ?? (url.pathname.replace(/^\//, "") || null);
    }
    case "arena": {
      const m = firstMatch(url, ARENA_PATTERNS);
      return m?.[1] ?? null;
    }
    case "cosmos": {
      // Cosmos uses path segments; keep them stable as the id.
      return url.pathname.replace(/\/$/, "").replace(/^\//, "") || null;
    }
    case "tiktok": {
      const m = firstMatch(url, TIKTOK_PATTERNS);
      return m?.[1] ?? null;
    }
    case "youtube": {
      const m = firstMatch(url, YOUTUBE_PATTERNS);
      return m?.[1] ?? null;
    }
  }
}
