import type { RateProfile, SourceDescriptor, SourceSyncConfig } from "./types";

/** Account-safe defaults a new source inherits without tuning: ~1 request / 1.5s, capped at 60/min, paced 2x slower during the first sync. */
export const DEFAULT_RATE_PROFILE: RateProfile = {
  minDelayMs: 1500,
  jitterFraction: 0.4,
  maxPerWindow: 60,
  windowMs: 60_000,
  firstSyncSlowdown: 2,
};

/** Default for any descriptor that omits `sync`. */
const NO_SYNC: SourceSyncConfig = {
  strategy: "none",
  rate: DEFAULT_RATE_PROFILE,
};

/** Source of truth for cross-runtime source facts; adding an entry (or running `pnpm new-source <id>`) widens the `Source` union automatically. */
export const SOURCE_DESCRIPTORS = [
  {
    id: "twitter",
    label: "Twitter",
    hosts: ["x.com", "twitter.com"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i,
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/web\/status\/(\d+)/i,
    ],
    /** GraphQL bookmark timeline is cursor-paginated and newest-first. */
    sync: { strategy: "cursor" },
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i,
    ],
    /** Saved-feed API is cursor-paginated; IG rate-limits aggressively, so pace it slower. */
    sync: {
      strategy: "cursor",
      rate: { minDelayMs: 2500, maxPerWindow: 30 },
    },
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com", "pin.it"],
    urlPatterns: [
      /^https?:\/\/(?:[a-z]+\.)?pinterest\.[a-z.]+\/pin\/(\d+)/i,
      /^https?:\/\/pin\.it\/[A-Za-z0-9]+/i,
    ],
    sync: { strategy: "scroll" },
  },
  {
    id: "arena",
    label: "Are.na",
    hosts: ["are.na"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?are\.na\/block\/(\d+)/i,
      /^https?:\/\/(?:www\.)?are\.na\/[^/]+\/[^/]+-(\d+)/i,
    ],
    sync: { strategy: "scroll" },
  },
  {
    id: "cosmos",
    label: "Cosmos",
    hosts: ["cosmos.so"],
    urlPatterns: [/^https?:\/\/(?:www\.)?cosmos\.so\/[^/]+\/?/i],
    sync: { strategy: "scroll" },
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    urlPatterns: [
      /^https?:\/\/(?:[a-z]+\.)?tiktok\.com\/[^/]+\/video\/(\d+)/i,
      /** Extension favorite emit when the feed cache has not yet seen the author handle. */
      /^https?:\/\/(?:[a-z]+\.)?tiktok\.com\/video\/(\d+)/i,
      /^https?:\/\/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+/i,
    ],
    sync: { strategy: "scroll" },
  },
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    urlPatterns: [
      /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]+)/i,
      /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]+)/i,
      /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]+)/i,
    ],
    sync: { strategy: "scroll" },
  },
  {
    id: "reddit",
    label: "Reddit",
    hosts: ["reddit.com", "redd.it"],
    urlPatterns: [
      /^https?:\/\/(?:[a-z]+\.)?reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i,
      /^https?:\/\/(?:[a-z]+\.)?reddit\.com\/comments\/([a-z0-9]+)/i,
      /^https?:\/\/redd\.it\/([a-z0-9]+)/i,
    ],
    /** Saved listing `.json` is cursor-paginated and newest-first. */
    sync: { strategy: "cursor" },
  },
  {
    id: "threads",
    label: "Threads",
    hosts: ["threads.net", "threads.com"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/i,
      /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/t\/([A-Za-z0-9_-]+)/i,
    ],
    /** Saved collection is infinite-scroll DOM with no stable public list API. */
    sync: { strategy: "scroll" },
  },
] as const satisfies readonly SourceDescriptor[];

/** The id of an external (non-`local`) source. */
export type ExternalSource = (typeof SOURCE_DESCRIPTORS)[number]["id"];

/** External source ids, in canonical order. */
export const EXTERNAL_SOURCE_IDS: readonly ExternalSource[] =
  SOURCE_DESCRIPTORS.map((d) => d.id);

const BY_ID = new Map<string, SourceDescriptor>(
  SOURCE_DESCRIPTORS.map((d) => [d.id, d]),
);

/** Look up the descriptor for an external source. Throws on unknown ids. */
export function descriptorFor(id: ExternalSource): SourceDescriptor {
  const descriptor = BY_ID.get(id);
  if (!descriptor) throw new Error(`no source descriptor for "${id}"`);
  return descriptor;
}

/**
 * Always returns a complete `SourceSyncConfig`, so callers never special-case a missing field and an
 * undeclared source stays account-safe via DEFAULT_RATE_PROFILE. Unknown or non-external ids resolve to no-sync.
 */
export function syncConfigFor(id: string): SourceSyncConfig {
  const descriptor = BY_ID.get(id);
  const override = descriptor?.sync;
  if (!override) return NO_SYNC;
  return {
    strategy: override.strategy ?? NO_SYNC.strategy,
    rate: { ...DEFAULT_RATE_PROFILE, ...override.rate },
  };
}
