import type { ListKind, MediaType } from "@pond/schema/db";
import { descriptorFor, hostToSource } from "@pond/schema/sources";
import { z } from "zod";

export interface ListingMedia {
  url: string;
  type?: MediaType;
  poster?: string;
}

export interface ListingEntry {
  sourceId: string;
  url: string;
  savedAt?: string;
  publishedAt?: string;
  title?: string;
  description?: string;
  author?: string;
  subreddit?: string;
  likes?: number;
  comments?: number;
  mediaUrl?: string;
  mediaUrls?: ListingMedia[];
  mediaType?: MediaType;
  listKinds?: ListKind[];
}

export type RedditListingKind = "saved" | "upvoted";

export function redditListingUrl(
  handle: string,
  kind: RedditListingKind,
  after: string | null,
): string {
  const params = new URLSearchParams({
    limit: "100",
    raw_json: "1",
    type: "links",
  });
  if (after) params.set("after", after);
  return `https://www.reddit.com/user/${encodeURIComponent(handle)}/${kind}.json?${params}`;
}

export interface ListingPage {
  entries: ListingEntry[];
  after: string | null;
}

const OptionalText = z.string().min(1).optional().catch(undefined);
const OptionalNumber = z
  .number()
  .refine(Number.isFinite)
  .optional()
  .catch(undefined);

export const RedditAccountSchema = z
  .object({
    kind: OptionalText,
    data: z
      .object({
        name: OptionalText,
        icon_img: OptionalText,
        snoovatar_img: OptionalText,
        subreddit: z
          .object({ icon_img: OptionalText, community_icon: OptionalText })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export type RedditAccount = z.infer<typeof RedditAccountSchema>;

const RedditVideoSchema = z
  .object({
    reddit_video: z
      .object({ fallback_url: OptionalText, dash_url: OptionalText })
      .optional()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);

const RedditPreviewSchema = z
  .object({
    images: z
      .array(
        z
          .object({
            source: z.object({ url: OptionalText }).optional().catch(undefined),
          })
          .catch({}),
      )
      .optional()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);

const RedditLinkSchema = z.object({
  url: OptionalText,
  url_overridden_by_dest: OptionalText,
  is_video: z.boolean().optional().catch(undefined),
  media: RedditVideoSchema,
  secure_media: RedditVideoSchema,
  preview: RedditPreviewSchema,
});

const RedditPostSchema = RedditLinkSchema.extend({
  id: OptionalText,
  permalink: OptionalText,
  title: OptionalText,
  selftext: OptionalText,
  author: OptionalText,
  subreddit: OptionalText,
  subreddit_name_prefixed: OptionalText,
  created_utc: OptionalNumber,
  score: OptionalNumber,
  num_comments: OptionalNumber,
  crosspost_parent_list: z
    .array(RedditLinkSchema.catch({}))
    .optional()
    .catch(undefined),
  media_metadata: z
    .record(
      z.string(),
      z
        .object({
          s: z.object({ u: OptionalText }).optional().catch(undefined),
        })
        .catch({}),
    )
    .optional()
    .catch(undefined),
});

type RedditPost = z.infer<typeof RedditPostSchema>;

export const RedditListingSchema = z
  .object({
    error: OptionalNumber,
    data: z
      .object({
        after: OptionalText,
        children: z
          .array(
            z
              .object({
                kind: OptionalText,
                data: RedditPostSchema.optional().catch(undefined),
              })
              .catch({}),
          )
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export type RedditListing = z.infer<typeof RedditListingSchema>;

export const RedditPostResponseSchema = z.union([
  z.array(RedditListingSchema),
  RedditListingSchema,
]);

export function handleFromMeJson(account: RedditAccount): string | null {
  const name = account.data?.name;
  if (name === undefined) return null;
  const handle = name.replace(/^u\//, "").trim();
  if (!handle || handle === "[deleted]" || handle === "me") return null;
  return handle;
}

export function avatarFromMeJson(account: RedditAccount): string | null {
  const data = account.data;
  if (!data) return null;
  const sub = data.subreddit;
  for (const raw of [
    data.icon_img,
    data.snoovatar_img,
    sub?.icon_img,
    sub?.community_icon,
  ]) {
    const url = cleanAvatarUrl(raw);
    if (url) return url;
  }
  return null;
}

function cleanAvatarUrl(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const url = raw.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

export function entriesFromListing(listing: RedditListing): ListingPage {
  if (listing.error === 403) return { entries: [], after: null };
  const children = listing.data?.children ?? [];
  const entries: ListingEntry[] = [];
  for (const child of children) {
    if (child.kind !== "t3") continue;
    const data = child.data;
    if (!data) continue;
    const id = data.id;
    if (!id) continue;
    const permalink = data.permalink ?? `/comments/${id}/`;
    const url = permalink.startsWith("http")
      ? permalink
      : `https://www.reddit.com${permalink}`;
    const selftext = data.selftext;
    const publishedAt = data.created_utc
      ? new Date(data.created_utc * 1000).toISOString()
      : undefined;
    const subreddit =
      data.subreddit_name_prefixed ??
      (data.subreddit ? `r/${data.subreddit}` : undefined);
    const entry: ListingEntry = { sourceId: id, url };
    if (data.title) entry.title = data.title;
    if (selftext) {
      entry.description =
        selftext.length > 4000 ? `${selftext.slice(0, 4000)}…` : selftext;
    }
    if (data.author) entry.author = data.author;
    if (subreddit) entry.subreddit = subreddit;
    Object.assign(entry, mediaFromPost(data));
    if (publishedAt) {
      entry.publishedAt = publishedAt;
      entry.savedAt = publishedAt;
    }
    if (data.score !== undefined) entry.likes = data.score;
    if (data.num_comments !== undefined) entry.comments = data.num_comments;
    entries.push(entry);
  }
  const after = listing.data?.after ?? null;
  return { entries, after };
}

type RedditLink = z.infer<typeof RedditLinkSchema>;

/**
 * yt-dlp already downloads a Reddit post's own v.redd.it file, a crosspost's
 * parent file, and an outbound video it knows how to continue into. YouTube,
 * Vimeo, and TikTok are the Pond sources whose item URLs are those videos.
 * Any other embed stays an image so an unsupported host cannot fail the save.
 */
const EMBED_VIDEO_SOURCES = ["youtube", "vimeo", "tiktok"] as const;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function mediaFromPost(
  data: RedditPost,
): Pick<ListingEntry, "mediaUrl" | "mediaUrls" | "mediaType"> {
  const video = videoFromPost(data);
  if (video) return video;
  const gallery = galleryUrls(data);
  if (gallery.length > 0) {
    return {
      mediaUrl: gallery[0]?.url,
      mediaUrls: gallery,
      mediaType: "image",
    };
  }
  const direct = data.url;
  if (direct && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(direct)) {
    return {
      mediaUrl: direct,
      mediaUrls: [{ url: direct, type: "image" }],
      mediaType: "image",
    };
  }
  const preview = firstPreviewUrl(data);
  if (preview) {
    return {
      mediaUrl: preview,
      mediaUrls: [{ url: preview, type: "image" }],
      mediaType: "image",
    };
  }
  return {};
}

function videoFromPost(
  data: RedditPost,
): Pick<ListingEntry, "mediaUrl" | "mediaUrls" | "mediaType"> | null {
  const own = hostedVideo(data);
  if (own) return videoMedia(own.url, own.poster);
  for (const parent of data.crosspost_parent_list ?? []) {
    const parentVideo = hostedVideo(parent);
    if (!parentVideo) continue;
    return videoMedia(
      parentVideo.url,
      firstPreviewUrl(data) ?? parentVideo.poster,
    );
  }
  const embed = embeddedVideoUrl(data) ?? parentEmbeddedVideoUrl(data);
  if (embed) return videoMedia(embed, firstPreviewUrl(data));
  return null;
}

function videoMedia(
  url: string,
  poster: string | undefined,
): Pick<ListingEntry, "mediaUrl" | "mediaUrls" | "mediaType"> {
  const video: ListingMedia = { url, type: "video" };
  if (poster) video.poster = poster;
  return {
    mediaUrl: poster ?? url,
    mediaUrls: [video],
    mediaType: "video",
  };
}

function hostedVideo(
  data: RedditLink,
): { url: string; poster?: string } | null {
  const redditVideo =
    data.media?.reddit_video ?? data.secure_media?.reddit_video;
  const url = redditVideo?.fallback_url ?? redditVideo?.dash_url;
  if (data.is_video !== true || !url) return null;
  const poster = firstPreviewUrl(data);
  return poster ? { url, poster } : { url };
}

function parentEmbeddedVideoUrl(data: RedditPost): string | null {
  for (const parent of data.crosspost_parent_list ?? []) {
    const url = embeddedVideoUrl(parent);
    if (url) return url;
  }
  return null;
}

function embeddedVideoUrl(data: RedditLink): string | null {
  for (const raw of [data.url_overridden_by_dest, data.url]) {
    const video = supportedEmbedUrl(raw);
    if (video) return video;
  }
  return null;
}

function isEmbedVideoSource(
  source: ReturnType<typeof hostToSource>,
): source is (typeof EMBED_VIDEO_SOURCES)[number] {
  for (const id of EMBED_VIDEO_SOURCES) {
    if (source === id) return true;
  }
  return false;
}

function supportedEmbedUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const source = hostToSource(raw);
  if (
    isEmbedVideoSource(source) &&
    descriptorFor(source).urlPatterns.some((pattern) => pattern.test(raw))
  ) {
    return raw;
  }
  return youtubeVideoUrl(raw);
}

function youtubeVideoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && YOUTUBE_ID.test(id) ? raw : null;
  }
  const youtube =
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube.com");
  if (!youtube) return null;
  const fromPath = /^\/(?:embed|live|shorts)\/([^/?#]+)/.exec(
    url.pathname,
  )?.[1];
  const id = url.searchParams.get("v") ?? fromPath;
  return id && YOUTUBE_ID.test(id) ? raw : null;
}

function firstPreviewUrl(data: RedditLink): string | undefined {
  const source = data.preview?.images?.[0]?.source;
  return source?.url?.replace(/&amp;/g, "&");
}

function galleryUrls(data: RedditPost): ListingMedia[] {
  const meta = data.media_metadata;
  if (!meta) return [];
  const out: ListingMedia[] = [];
  for (const value of Object.values(meta)) {
    const url = value.s?.u?.replace(/&amp;/g, "&");
    if (url) out.push({ url, type: "image" });
  }
  return out;
}
