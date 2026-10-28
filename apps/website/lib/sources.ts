import {
  IconBrandArena,
  IconBrandBehance,
  IconBrandBluesky,
  IconBrandCosmos,
  IconBrandDribbble,
  IconBrandGithub,
  IconBrandSavee,
  IconBrandSubstack,
  IconBrandThreads,
  IconBrandTumblr,
  IconBrandUnsplash,
  IconBrandVimeo,
  IconInstagram,
  IconPinterest,
  IconReddit,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import type { ComponentType, SVGProps } from "react";

export type SourceId =
  | "twitter"
  | "instagram"
  | "pinterest"
  | "arena"
  | "cosmos"
  | "tiktok"
  | "youtube"
  | "reddit"
  | "threads"
  | "github"
  | "substack"
  | "tumblr"
  | "savee"
  | "behance"
  | "vimeo"
  | "dribbble"
  | "unsplash"
  | "bluesky";

export type SourceGroup = "social" | "design" | "video" | "reading";

export interface SourceInfo {
  id: SourceId;
  label: string;
  host: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: SourceGroup;
  syncs: string;
  connect: "session" | "handle";
  watch: boolean;
  importable: boolean;
  added: "1.x" | "2.0";
}

export const SOURCE_GROUPS: { id: SourceGroup; label: string }[] = [
  { id: "social", label: "Social" },
  { id: "design", label: "Design" },
  { id: "video", label: "Video" },
  { id: "reading", label: "Reading and Code" },
];

/** Order and connect modes follow `SOURCE_DESCRIPTORS` in `@pond/schema/sources`. */
export const SOURCES: SourceInfo[] = [
  {
    id: "twitter",
    label: "Twitter",
    host: "x.com",
    Icon: IconXTwitter,
    group: "social",
    syncs: "Bookmarks, bookmark folders, and likes.",
    connect: "session",
    watch: true,
    importable: true,
    added: "1.x",
  },
  {
    id: "instagram",
    label: "Instagram",
    host: "instagram.com",
    Icon: IconInstagram,
    group: "social",
    syncs: "Saved posts, collections, and likes.",
    connect: "session",
    watch: true,
    importable: true,
    added: "1.x",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    host: "pinterest.com",
    Icon: IconPinterest,
    group: "design",
    syncs: "Your pins and boards.",
    connect: "session",
    watch: true,
    importable: false,
    added: "1.x",
  },
  {
    id: "arena",
    label: "Are.na",
    host: "are.na",
    Icon: IconBrandArena,
    group: "design",
    syncs: "Blocks from your channels.",
    connect: "session",
    watch: true,
    importable: false,
    added: "1.x",
  },
  {
    id: "cosmos",
    label: "Cosmos",
    host: "cosmos.so",
    Icon: IconBrandCosmos,
    group: "design",
    syncs: "Your saved elements and clusters.",
    connect: "session",
    watch: true,
    importable: false,
    added: "1.x",
  },
  {
    id: "tiktok",
    label: "TikTok",
    host: "tiktok.com",
    Icon: IconTikTok,
    group: "video",
    syncs: "Favorites and liked videos.",
    connect: "session",
    watch: true,
    importable: true,
    added: "1.x",
  },
  {
    id: "youtube",
    label: "YouTube",
    host: "youtube.com",
    Icon: IconYoutube,
    group: "video",
    syncs: "Liked videos, Watch Later, and playlists.",
    connect: "session",
    watch: true,
    importable: true,
    added: "1.x",
  },
  {
    id: "reddit",
    label: "Reddit",
    host: "reddit.com",
    Icon: IconReddit,
    group: "social",
    syncs: "Saved and upvoted posts.",
    connect: "session",
    watch: false,
    importable: true,
    added: "1.x",
  },
  {
    id: "threads",
    label: "Threads",
    host: "threads.com",
    Icon: IconBrandThreads,
    group: "social",
    syncs: "Posts you saved.",
    connect: "session",
    watch: false,
    importable: false,
    added: "1.x",
  },
  {
    id: "github",
    label: "GitHub",
    host: "github.com",
    Icon: IconBrandGithub,
    group: "reading",
    syncs: "Repositories you star, with each README to read in Pond.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "substack",
    label: "Substack",
    host: "substack.com",
    Icon: IconBrandSubstack,
    group: "reading",
    syncs:
      "Saved and liked posts, plus new posts from publications you follow.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "tumblr",
    label: "Tumblr",
    host: "tumblr.com",
    Icon: IconBrandTumblr,
    group: "social",
    syncs: "Likes, with the time you liked each post.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "savee",
    label: "Savee",
    host: "savee.com",
    Icon: IconBrandSavee,
    group: "design",
    syncs: "The items you saved, newest first.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "behance",
    label: "Behance",
    host: "behance.net",
    Icon: IconBrandBehance,
    group: "design",
    syncs: "Appreciated projects, with the date you appreciated them.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "vimeo",
    label: "Vimeo",
    host: "vimeo.com",
    Icon: IconBrandVimeo,
    group: "video",
    syncs: "Likes and your Watch Later list.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "dribbble",
    label: "Dribbble",
    host: "dribbble.com",
    Icon: IconBrandDribbble,
    group: "design",
    syncs: "The shots you liked.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "unsplash",
    label: "Unsplash",
    host: "unsplash.com",
    Icon: IconBrandUnsplash,
    group: "design",
    syncs: "Your bookmarked photos.",
    connect: "session",
    watch: false,
    importable: false,
    added: "2.0",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    host: "bsky.app",
    Icon: IconBrandBluesky,
    group: "social",
    syncs: "Public likes from your handle, and bookmarks once you sign in.",
    connect: "handle",
    watch: false,
    importable: false,
    added: "2.0",
  },
];

export function getSource(id: SourceId): SourceInfo {
  const source = SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}
