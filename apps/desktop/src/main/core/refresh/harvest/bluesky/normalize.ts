import type { Capture, CaptureFacet, CaptureMedia } from "@pond/schema/raw";
import type { ListEntry } from "../list-types";
import { rkeyOf } from "./atproto";
import type {
  BlueskyAuthor,
  BlueskyEmbed,
  BlueskyPost,
  BlueskyRecord,
  BlueskyViewRecord,
} from "./atproto";

const WEB = "https://bsky.app";

interface PostMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  width?: number;
  height?: number;
}

function postUrl(handle: string, uri: string): string {
  return `${WEB}/profile/${handle}/post/${rkeyOf(uri) ?? ""}`;
}

function sized(
  media: PostMedia,
  ratio: { width: number; height: number } | undefined,
): PostMedia {
  return ratio ? { ...media, width: ratio.width, height: ratio.height } : media;
}

/** A quote with media nests the media one level down; the quoted post's own media stays with the quote. */
export function postMedia(
  embed: (BlueskyEmbed & { media?: BlueskyEmbed }) | undefined,
): Array<PostMedia> {
  if (!embed) {
    return [];
  }
  switch (embed.$type) {
    case "app.bsky.embed.images#view":
      return (embed.images ?? []).map((i) =>
        sized({ url: i.fullsize, type: "image" }, i.aspectRatio),
      );
    case "app.bsky.embed.gallery#view":
      return (embed.items ?? []).map((i) =>
        sized({ url: i.fullsize, type: "image" }, i.aspectRatio),
      );
    case "app.bsky.embed.video#view":
      if (!embed.playlist) return [];
      return [
        sized(
          embed.thumbnail
            ? { url: embed.playlist, type: "video", poster: embed.thumbnail }
            : { url: embed.playlist, type: "video" },
          embed.aspectRatio,
        ),
      ];
    case "app.bsky.embed.recordWithMedia#view":
      return postMedia(embed.media);
    case "app.bsky.embed.external#view":
      return embed.external?.thumb
        ? [{ url: embed.external.thumb, type: "image" }]
        : [];
    default:
      return [];
  }
}

export function postEntry(
  post: BlueskyPost,
  likedAt: string | undefined,
): ListEntry {
  const entry: ListEntry = {
    sourceId: rkeyOf(post.uri) ?? post.uri,
    url: postUrl(post.author.handle, post.uri),
    author: `@${post.author.handle}`,
    listKinds: ["liked"],
  };
  if (likedAt) entry.savedAt = likedAt;
  if (post.record.text) entry.description = post.record.text;
  const media = postMedia(post.embed);
  const [first] = media;
  if (first) {
    entry.mediaUrl = first.url;
    entry.mediaUrls = media.map(({ url, type, poster }) =>
      poster ? { url, type, poster } : { url, type },
    );
    entry.mediaType = media.some((m) => m.type === "video") ? "video" : "image";
  } else {
    entry.mediaType = "text";
  }
  return entry;
}

function facetsOf(record: BlueskyRecord): Array<CaptureFacet> {
  const out: Array<CaptureFacet> = [];
  for (const facet of record.facets ?? []) {
    const feature = facet.features[0]?.$type ?? "";
    const type = feature.endsWith("#link")
      ? "link"
      : feature.endsWith("#mention")
        ? "mention"
        : feature.endsWith("#tag")
          ? "tag"
          : null;
    if (type) {
      out.push({
        start: facet.index.byteStart,
        end: facet.index.byteEnd,
        type,
      });
    }
  }
  return out;
}

function captureOf(
  author: BlueskyAuthor,
  uri: string,
  record: BlueskyRecord,
  media: Array<PostMedia>,
): Capture {
  const capture: Capture = {
    id: rkeyOf(uri) ?? uri,
    source: "bluesky",
    url: postUrl(author.handle, uri),
    author: {
      name: author.displayName || author.handle,
      handle: author.handle,
      profileUrl: `${WEB}/profile/${author.handle}`,
    },
    media: media.map((m) => {
      const item: CaptureMedia = { url: m.url, type: m.type };
      if (m.poster) item.posterUrl = m.poster;
      if (m.width && m.height) {
        item.width = m.width;
        item.height = m.height;
      }
      return item;
    }),
  };
  if (author.avatar && capture.author) capture.author.avatarUrl = author.avatar;
  if (author.verification?.verifiedStatus === "valid" && capture.author) {
    capture.author.verified = true;
  }
  if (record.text) capture.description = record.text;
  if (record.createdAt) capture.publishedAt = record.createdAt;
  const facets = facetsOf(record);
  if (facets.length > 0) capture.extras = { facets };
  return capture;
}

function quotedOf(embed: BlueskyPost["embed"]): BlueskyViewRecord | undefined {
  const record = embed?.record;
  if (!record) return undefined;
  return "uri" in record ? record : record.record;
}

/** A video's media is its HLS playlist, so yt-dlp downloads it from the post URL instead of the blob fetcher. */
export function captureFromPost(post: BlueskyPost): Capture {
  const capture = captureOf(
    post.author,
    post.uri,
    post.record,
    postMedia(post.embed),
  );
  const metrics: NonNullable<Capture["metrics"]> = {};
  if (post.likeCount !== undefined) metrics.likes = post.likeCount;
  if (post.replyCount !== undefined) metrics.replies = post.replyCount;
  if (post.repostCount !== undefined) metrics.retweets = post.repostCount;
  if (post.quoteCount !== undefined) metrics.quotes = post.quoteCount;
  if (post.bookmarkCount !== undefined) metrics.bookmarks = post.bookmarkCount;
  if (Object.keys(metrics).length > 0) capture.metrics = metrics;

  const card = cardOf(post.embed);
  if (card) capture.card = card;

  const quoted = quotedOf(post.embed);
  if (quoted) {
    capture.quoted = captureOf(
      quoted.author,
      quoted.uri,
      quoted.value,
      postMedia(quoted.embeds?.[0]),
    );
    const quotedCard = cardOf(quoted.embeds?.[0]);
    if (quotedCard) capture.quoted.card = quotedCard;
  }
  return capture;
}

function cardOf(embed: BlueskyEmbed | undefined): Capture["card"] {
  const external = embed?.external;
  if (embed?.$type !== "app.bsky.embed.external#view" || !external?.uri) {
    return undefined;
  }
  const card: NonNullable<Capture["card"]> = { url: external.uri };
  try {
    card.domain = new URL(external.uri).hostname.replace(/^www\./, "");
  } catch {
    /** A card with an unparseable link keeps its URL and goes without a domain. */
  }
  if (external.title) {
    card.title = external.title;
  }
  if (external.description) {
    card.description = external.description;
  }
  if (external.thumb) {
    card.imageUrl = external.thumb;
  }
  return card;
}
