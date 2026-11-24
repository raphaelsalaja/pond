import type { ListKind, Source } from "@pond/schema/db";
import { LIST_KIND_LABELS } from "@pond/schema/list-kinds";

type ListKindCopy = Partial<Record<ListKind, string>>;

const SOURCE_LIST_KIND_LABELS = new Map<Source, ListKindCopy>([
  ["instagram", { saved: "Saved Posts", liked: "Liked Posts" }],
  ["youtube", { saved: "Saved Videos", liked: "Liked Videos" }],
  ["tiktok", { saved: "Favorites", liked: "Liked Videos" }],
  ["reddit", { saved: "Saved Posts", liked: "Upvoted Posts" }],
  ["threads", { saved: "Saved Posts", liked: "Liked Posts" }],
  ["twitter", { saved: "Bookmarks", liked: "Likes" }],
  [
    "substack",
    {
      saved: "Saved Posts",
      liked: "Liked Posts",
      subscription: "Subscriptions",
    },
  ],
  ["vimeo", { saved: "Watch Later", liked: "Likes" }],
  ["bluesky", { saved: "Bookmarks", liked: "Likes" }],
]);

const SOURCE_LIST_KIND_DESCRIPTIONS = new Map<Source, ListKindCopy>([
  [
    "instagram",
    {
      saved: "Posts you've saved on Instagram.",
      liked: "Posts you've liked on Instagram.",
    },
  ],
  [
    "youtube",
    {
      saved: "Videos you've saved on YouTube.",
      liked: "Videos you've liked on YouTube.",
    },
  ],
  [
    "tiktok",
    {
      saved: "Videos you've added to Favorites on TikTok.",
      liked: "Videos you've liked on TikTok.",
    },
  ],
  [
    "reddit",
    {
      saved: "Posts you've saved on Reddit.",
      liked: "Posts you've upvoted on Reddit.",
    },
  ],
  [
    "threads",
    {
      saved: "Posts you've saved on Threads.",
      liked: "Posts you've liked on Threads.",
    },
  ],
  [
    "twitter",
    {
      saved: "Posts you've bookmarked on Twitter.",
      liked: "Posts you've liked on Twitter.",
    },
  ],
  [
    "substack",
    {
      saved: "Posts you've saved on Substack.",
      liked: "Posts you've liked on Substack.",
      subscription:
        "New posts from publications you subscribe to, from the week you connect onward.",
    },
  ],
  [
    "vimeo",
    {
      saved: "Videos you've added to Watch Later on Vimeo.",
      liked: "Videos you've liked on Vimeo.",
    },
  ],
  [
    "bluesky",
    {
      saved: "Posts you've bookmarked on Bluesky.",
      liked: "Posts you've liked on Bluesky.",
    },
  ],
]);

export function listKindLabel(source: Source, kind: ListKind): string {
  return SOURCE_LIST_KIND_LABELS.get(source)?.[kind] ?? LIST_KIND_LABELS[kind];
}

export function listKindDescription(
  source: Source,
  kind: ListKind,
): string | null {
  return SOURCE_LIST_KIND_DESCRIPTIONS.get(source)?.[kind] ?? null;
}
