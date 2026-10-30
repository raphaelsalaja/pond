import type { RateProfile, SourceDescriptor, SourceSyncConfig } from "./types";

export const DEFAULT_RATE_PROFILE: RateProfile = {
  minDelayMs: 1500,
  jitterFraction: 0.4,
  maxPerWindow: 60,
  windowMs: 60_000,
  firstSyncSlowdown: 2,
  maxPerHour: 240,
  maxPerDay: 1500,
};

/** First-level paths GitHub keeps for itself, so `github.com/settings/profile` never reads as a repo. */
const GITHUB_RESERVED =
  "about|apps|codespaces|collections|contact|customer-stories|dashboard|enterprise|events|explore|features|issues|login|logout|marketplace|new|notifications|orgs|organizations|pricing|pulls|readme|search|security|settings|signup|site|sponsors|stars|team|topics|trending|watching";

/** Matches a repo root only; deeper links like issues or files stay plain web saves. */
export const GITHUB_REPO_PATTERN = new RegExp(
  `^https?://(?:www\\.)?github\\.com/(?!(?:${GITHUB_RESERVED})/)([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]+?)(?:\\.git)?/?(?:[?#].*)?$`,
  "i",
);

const NO_SYNC: SourceSyncConfig = {
  strategy: "none",
  rate: DEFAULT_RATE_PROFILE,
};

export const SOURCE_DESCRIPTORS = [
  {
    id: "twitter",
    label: "Twitter",
    hosts: ["x.com", "twitter.com"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i,
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/web\/status\/(\d+)/i,
    ],
    sync: {
      strategy: "cursor",
      rate: { minDelayMs: 3000, maxPerHour: 150, maxPerDay: 1000 },
    },
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
      rate: {
        minDelayMs: 2500,
        maxPerWindow: 30,
        maxPerHour: 120,
        maxPerDay: 600,
      },
    },
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com", "pin.it"],
    urlPatterns: [
      /^https?:\/\/(?:[a-z]+\.)?pinterest\.[a-z.]+\/pin\/(\d+)/i,
      /^https?:\/\/pin\.it\/([A-Za-z0-9]+)/i,
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
    urlPatterns: [
      /^https?:\/\/(?:www\.)?cosmos\.so\/e\/([A-Za-z0-9_-]+)/i,
      /^https?:\/\/(?:www\.)?cosmos\.so\/(.+?)\/?$/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    urlPatterns: [
      /^https?:\/\/(?:[a-z]+\.)?tiktok\.com\/[^/]+\/video\/(\d+)/i,
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
    sync: { strategy: "scroll" },
  },
  {
    id: "github",
    label: "GitHub",
    hosts: ["github.com"],
    urlPatterns: [GITHUB_REPO_PATTERN],
    /** Unauthenticated API calls share 60 an hour per IP, so stars sync slower than the default. */
    sync: {
      strategy: "cursor",
      rate: { minDelayMs: 2000, maxPerWindow: 30, maxPerHour: 120 },
    },
  },
  {
    id: "substack",
    label: "Substack",
    hosts: ["substack.com"],
    /** A post on its publication's subdomain keys by that address; reader links only carry the numeric id. */
    urlPatterns: [
      /^https?:\/\/((?!www\.|open\.)[a-z0-9-]+\.substack\.com\/p\/[A-Za-z0-9_-]+)/i,
      /^https?:\/\/(?:www\.)?substack\.com\/(?:@[^/]+|home\/post)\/(p-\d+)/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "tumblr",
    label: "Tumblr",
    hosts: ["tumblr.com"],
    /** Post ids are global, so the blog in the path only matters when fetching the post. */
    urlPatterns: [
      /^https?:\/\/(?:www\.)?tumblr\.com\/(?:blog\/view\/)?[a-z0-9-]+\/(\d{6,20})(?:[/?#]|$)/i,
      /^https?:\/\/(?!www\.)[a-z0-9-]+\.tumblr\.com\/(?:post|image)\/(\d{6,20})(?:[/?#]|$)/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "savee",
    label: "Savee",
    hosts: ["savee.com", "savee.it"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?savee\.(?:com|it)\/i\/([A-Za-z0-9_-]+)\/?(?:[?#]|$)/i,
    ],
    /** GraphQL allows 600 calls a minute and HTML pages only 200, so sync stays on GraphQL. */
    sync: { strategy: "cursor" },
  },
  {
    id: "behance",
    label: "Behance",
    hosts: ["behance.net", "be.net"],
    urlPatterns: [/^https?:\/\/(?:www\.)?(?:behance|be)\.net\/gallery\/(\d+)/i],
    /** gallery-dl paces Behance at two to four seconds a request; match its caution. */
    sync: { strategy: "cursor", rate: { minDelayMs: 2500, maxPerWindow: 24 } },
  },
  {
    id: "vimeo",
    label: "Vimeo",
    hosts: ["vimeo.com"],
    /** A vanity URL like `vimeo.com/staff/player` carries no id and stays a web save. */
    urlPatterns: [
      /^https?:\/\/(?:(?:www|player)\.)?vimeo\.com\/(?:video\/|videos\/|channels\/[^/?#]+\/|groups\/[^/?#]+\/videos\/|(?:album|showcase)\/\d+\/video\/|[^/?#]+\/review\/)?(\d{5,12})(?:\/[0-9a-f]{10})?(?:[/?#]|$)/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "dribbble",
    label: "Dribbble",
    hosts: ["dribbble.com", "drbl.in"],
    /** `drbl.in` short links carry no shot id until they redirect, so they match the host but not a pattern. */
    urlPatterns: [
      /^https?:\/\/(?:www\.)?dribbble\.com\/shots\/(\d+)(?=[-/?#]|$)/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "unsplash",
    label: "Unsplash",
    hosts: ["unsplash.com"],
    /** The id is the last 11 characters of the slug, and may itself contain `-` or `_`. */
    urlPatterns: [
      /^https?:\/\/(?:www\.)?unsplash\.com\/(?:photos|illustrations)\/(?:[^/?#]*-)?([A-Za-z0-9_-]{11})(?=[/?#]|$)/i,
    ],
    sync: { strategy: "cursor" },
  },
  {
    id: "bluesky",
    label: "Bluesky",
    hosts: ["bsky.app"],
    /** Keys by the post's rkey: a handle URL carries no DID, and TIDs embed a microsecond clock. */
    urlPatterns: [
      /^https?:\/\/(?:www\.)?bsky\.app\/profile\/[^/?#]+\/post\/([2-7a-z]{13})(?=[/?#]|$)/i,
    ],
    connect: "handle",
    sync: { strategy: "cursor" },
  },
  {
    id: "marked",
    label: "Marked",
    hosts: ["marked.dev"],
    urlPatterns: [
      /^https?:\/\/(?:www\.)?marked\.dev\/ref\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)/i,
    ],
    /** One `listLibraryRefs` call returns the whole library, so there is no page order to stop early on. */
    sync: { strategy: "full" },
  },
] as const satisfies readonly SourceDescriptor[];

export type ExternalSource = (typeof SOURCE_DESCRIPTORS)[number]["id"];

export const EXTERNAL_SOURCE_IDS: readonly ExternalSource[] =
  SOURCE_DESCRIPTORS.map((d) => d.id);

const BY_ID = new Map<string, SourceDescriptor>(
  SOURCE_DESCRIPTORS.map((d) => [d.id, d]),
);

export function descriptorFor(id: ExternalSource): SourceDescriptor {
  const descriptor = BY_ID.get(id);
  if (!descriptor) throw new Error(`no source descriptor for "${id}"`);
  return descriptor;
}

export function syncConfigFor(id: string): SourceSyncConfig {
  const descriptor = BY_ID.get(id);
  const override = descriptor?.sync;
  if (!override) return NO_SYNC;
  return {
    strategy: override.strategy ?? NO_SYNC.strategy,
    rate: { ...DEFAULT_RATE_PROFILE, ...override.rate },
  };
}
