import { descriptorFor } from "@pond/schema/sources";

export const TWITTER_PATTERNS = descriptorFor("twitter").urlPatterns;
export const INSTAGRAM_PATTERNS = descriptorFor("instagram").urlPatterns;
export const PINTEREST_PATTERNS = descriptorFor("pinterest").urlPatterns;
export const ARENA_PATTERNS = descriptorFor("arena").urlPatterns;
export const COSMOS_PATTERNS = descriptorFor("cosmos").urlPatterns;
export const TIKTOK_PATTERNS = descriptorFor("tiktok").urlPatterns;
export const YOUTUBE_PATTERNS = descriptorFor("youtube").urlPatterns;
export const REDDIT_PATTERNS = descriptorFor("reddit").urlPatterns;
export const THREADS_PATTERNS = descriptorFor("threads").urlPatterns;
export const GITHUB_PATTERNS = descriptorFor("github").urlPatterns;
export const SUBSTACK_PATTERNS = descriptorFor("substack").urlPatterns;
export const TUMBLR_PATTERNS = descriptorFor("tumblr").urlPatterns;
export const SAVEE_PATTERNS = descriptorFor("savee").urlPatterns;
export const BEHANCE_PATTERNS = descriptorFor("behance").urlPatterns;
export const VIMEO_PATTERNS = descriptorFor("vimeo").urlPatterns;
export const DRIBBBLE_PATTERNS = descriptorFor("dribbble").urlPatterns;
export const UNSPLASH_PATTERNS = descriptorFor("unsplash").urlPatterns;
export const BLUESKY_PATTERNS = descriptorFor("bluesky").urlPatterns;
export const MARKED_PATTERNS = descriptorFor("marked").urlPatterns;

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
