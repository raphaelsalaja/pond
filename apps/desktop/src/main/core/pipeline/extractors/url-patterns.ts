// Centralized URL patterns. Each extractor exposes its own validUrl array,
// but classifyUrlToSource() in pipeline/url.ts uses the union so that
// /enqueue can mint a `source` for the save row before any extractor runs.

export const TWITTER_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i,
  /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/web\/status\/(\d+)/i,
];

export const INSTAGRAM_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i,
];

export const PINTEREST_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:[a-z]+\.)?pinterest\.[a-z.]+\/pin\/(\d+)/i,
  /^https?:\/\/pin\.it\/[A-Za-z0-9]+/i,
];

export const ARENA_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.)?are\.na\/block\/(\d+)/i,
  /^https?:\/\/(?:www\.)?are\.na\/[^/]+\/[^/]+-(\d+)/i,
];

export const COSMOS_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.)?cosmos\.so\/[^/]+\/?/i,
];

export const TIKTOK_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:[a-z]+\.)?tiktok\.com\/[^/]+\/video\/(\d+)/i,
  /^https?:\/\/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+/i,
];

export const YOUTUBE_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]+)/i,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]+)/i,
  /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]+)/i,
];

export function firstMatch(
  url: URL,
  patterns: readonly RegExp[],
): RegExpExecArray | null {
  const s = url.href;
  for (const rx of patterns) {
    const m = rx.exec(s);
    if (m) return m;
  }
  return null;
}
