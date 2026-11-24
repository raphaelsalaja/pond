import type { JsonValue } from "@pond/schema/json";
import { describe, expect, it } from "vitest";
import { PostsSchema, tidToDate } from "./atproto";
import type { BlueskyPost } from "./atproto";
import { captureFromPost, postEntry, postMedia } from "./normalize";

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";
const FULLSIZE = `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/bafkreidvywlo2nyrizqs7vy7rl7e4m5hedt75lxq2xcpb4rlljvtyqhck4`;
const PLAYLIST = `https://video.bsky.app/watch/did%3Aplc%3Az72i7hdynmk6r22z27h6tvur/bafkreiew/playlist.m3u8`;
const THUMBNAIL = `https://video.bsky.app/watch/did%3Aplc%3Az72i7hdynmk6r22z27h6tvur/bafkreiew/thumbnail.jpg`;

const RAW_POST = {
  uri: `at://${DID}/app.bsky.feed.post/3mxu3hsnebc2v`,
  cid: "bafyreihprzpev5lpm4wkevfteaurguvmtmzq4cmg6guzwxvmlumvfdcsmy",
  author: {
    did: DID,
    handle: "bsky.app",
    displayName: "Bluesky",
    avatar: `https://cdn.bsky.app/img/avatar/plain/${DID}/bafkreihw`,
  },
  record: {
    $type: "app.bsky.feed.post",
    createdAt: "2026-10-14T17:35:30.592Z",
    text: "saw some cool clouds today",
  },
  embed: {
    $type: "app.bsky.embed.images#view",
    images: [
      {
        thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${DID}/bafkreidvy`,
        fullsize: FULLSIZE,
        alt: "Photo taken from a hill",
      },
    ],
  },
  replyCount: 238,
  repostCount: 417,
  likeCount: 7685,
};

function parsePost(raw: JsonValue): BlueskyPost {
  const [post] = PostsSchema.parse({ posts: [raw] }).posts;
  if (!post) {
    throw new Error("fixture did not parse");
  }
  return post;
}

const VIDEO_EMBED = {
  $type: "app.bsky.embed.video#view",
  playlist: PLAYLIST,
  thumbnail: THUMBNAIL,
  presentation: "gif",
};

describe("Bluesky TIDs", () => {
  it("decodes the clock in a like and a post rkey", () => {
    expect(tidToDate("3mys4qcjf6k24")).toBe("2026-10-26T16:18:01.568Z");
    expect(tidToDate("3mxu3hsnebc2v")).toBe("2026-10-14T17:35:30.593Z");
    expect(tidToDate("not-a-tid")).toBeUndefined();
  });
});

describe("Bluesky post media", () => {
  it("keeps the full-size image", () => {
    expect(postMedia(parsePost(RAW_POST).embed)).toEqual([
      { url: FULLSIZE, type: "image" },
    ]);
  });

  it("keeps a video's playlist with its thumbnail", () => {
    const post = parsePost({ ...RAW_POST, embed: VIDEO_EMBED });
    expect(postMedia(post.embed)).toEqual([
      { url: PLAYLIST, type: "video", poster: THUMBNAIL },
    ]);
  });

  it("reads the media beside a quoted post", () => {
    const post = parsePost({
      ...RAW_POST,
      embed: {
        $type: "app.bsky.embed.recordWithMedia#view",
        record: { record: { uri: "at://did:plc:other/app.bsky.feed.post/x" } },
        media: VIDEO_EMBED,
      },
    });
    expect(postMedia(post.embed)).toEqual([
      { url: PLAYLIST, type: "video", poster: THUMBNAIL },
    ]);
  });

  it("reads every photo in a gallery", () => {
    const post = parsePost({
      ...RAW_POST,
      embed: {
        $type: "app.bsky.embed.gallery#view",
        items: [
          { fullsize: "https://cdn.bsky.app/a" },
          { fullsize: "https://cdn.bsky.app/b" },
        ],
      },
    });
    expect(postMedia(post.embed).map((m) => m.url)).toEqual([
      "https://cdn.bsky.app/a",
      "https://cdn.bsky.app/b",
    ]);
  });
});

describe("Bluesky post entries", () => {
  it("builds a liked entry with the liked-at time", () => {
    expect(postEntry(parsePost(RAW_POST), "2026-10-26T16:18:01.499Z")).toEqual({
      sourceId: "3mxu3hsnebc2v",
      url: "https://bsky.app/profile/bsky.app/post/3mxu3hsnebc2v",
      savedAt: "2026-10-26T16:18:01.499Z",
      description: "saw some cool clouds today",
      author: "@bsky.app",
      mediaUrl: FULLSIZE,
      mediaUrls: [{ url: FULLSIZE, type: "image" }],
      mediaType: "image",
      listKinds: ["liked"],
    });
  });

  it("marks a post without media as text", () => {
    const post = parsePost({ ...RAW_POST, embed: null });
    expect(postEntry(post, undefined)).toMatchObject({ mediaType: "text" });
  });

  it("captures the author, time and counts", () => {
    expect(captureFromPost(parsePost(RAW_POST))).toMatchObject({
      id: "3mxu3hsnebc2v",
      source: "bluesky",
      url: "https://bsky.app/profile/bsky.app/post/3mxu3hsnebc2v",
      description: "saw some cool clouds today",
      publishedAt: "2026-10-14T17:35:30.592Z",
      author: {
        name: "Bluesky",
        handle: "bsky.app",
        avatarUrl: RAW_POST.author.avatar,
        profileUrl: "https://bsky.app/profile/bsky.app",
      },
      metrics: { likes: 7685, replies: 238, retweets: 417 },
      media: [{ url: FULLSIZE, type: "image" }],
    });
  });

  it("keeps the link card inside a quoted post", () => {
    const post = parsePost({
      ...RAW_POST,
      embed: {
        $type: "app.bsky.embed.record#view",
        record: {
          uri: "at://did:plc:other/app.bsky.feed.post/x",
          author: { did: "did:plc:other", handle: "dholms.at" },
          value: { text: "read the forum post" },
          embeds: [
            {
              $type: "app.bsky.embed.external#view",
              external: {
                uri: "https://www.example.com/t/updates",
                title: "Updates",
                description: "What changed",
                thumb: "https://cdn.bsky.app/thumb",
              },
            },
          ],
        },
      },
    });
    expect(captureFromPost(post).quoted?.card).toEqual({
      url: "https://www.example.com/t/updates",
      domain: "example.com",
      title: "Updates",
      description: "What changed",
      imageUrl: "https://cdn.bsky.app/thumb",
    });
  });
});
