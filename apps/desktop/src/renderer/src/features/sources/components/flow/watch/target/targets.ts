import type { Source } from "@pond/schema/db";

interface WatchKind {
  label: string;
  example: string;
}

interface WatchTargets {
  placeholder: string;
  kinds: ReadonlyArray<WatchKind>;
}

const TARGETS = new Map<Source, WatchTargets>([
  [
    "web",
    {
      placeholder: "https://example.com/feed.xml",
      kinds: [{ label: "RSS and Atom feeds", example: "Feed URL" }],
    },
  ],
  [
    "arena",
    {
      placeholder: "Channel name or are.na link",
      kinds: [
        { label: "Channels", example: "channel-name" },
        { label: "Users", example: "username" },
        { label: "Groups", example: "group-name" },
      ],
    },
  ],
  [
    "cosmos",
    {
      placeholder: "Username or cosmos.so link",
      kinds: [
        { label: "Profiles", example: "username" },
        { label: "Clusters", example: "username/cluster" },
      ],
    },
  ],
  [
    "instagram",
    {
      placeholder: "@handle or instagram.com link",
      kinds: [{ label: "Accounts", example: "@handle" }],
    },
  ],
  [
    "pinterest",
    {
      placeholder: "Username or pinterest.com link",
      kinds: [
        { label: "Profiles", example: "username" },
        { label: "Boards", example: "username/board" },
      ],
    },
  ],
  [
    "tiktok",
    {
      placeholder: "@handle or tiktok.com link",
      kinds: [{ label: "Accounts", example: "@handle" }],
    },
  ],
  [
    "twitter",
    {
      placeholder: "@handle or x.com link",
      kinds: [
        { label: "Accounts", example: "@handle" },
        { label: "Lists", example: "x.com/i/lists/123" },
      ],
    },
  ],
  [
    "youtube",
    {
      placeholder: "@channel or youtube.com link",
      kinds: [
        { label: "Channels", example: "@channel" },
        { label: "Playlists", example: "Playlist link" },
      ],
    },
  ],
]);

const FALLBACK: WatchTargets = {
  placeholder: "Paste a link or enter a handle",
  kinds: [{ label: "Profiles", example: "Profile link" }],
};

export function watchTargets(source: Source): WatchTargets {
  return TARGETS.get(source) ?? FALLBACK;
}
