import log from "electron-log/main.js";
import { z } from "zod";

const bookmarksEnvelope = z.object({
  data: z.record(z.string(), z.unknown()),
});

let envelopeFailureLogged = false;

const scrapedText = z.string().optional().catch(undefined);
const scrapedNumber = z.number().optional().catch(undefined);

const MediaEntrySchema = z
  .object({
    media_url_https: scrapedText,
    type: scrapedText,
    original_info: z
      .object({ width: scrapedNumber, height: scrapedNumber })
      .optional()
      .catch(undefined),
    video_info: z
      .object({
        duration_millis: scrapedNumber,
        aspect_ratio: z.array(scrapedNumber).optional().catch(undefined),
        variants: z
          .array(
            z
              .object({ bitrate: scrapedNumber, url: scrapedText })
              .catch({ bitrate: undefined, url: undefined }),
          )
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

const NestedNodeSchema = z.json().optional().catch(undefined);
type NestedNode = z.infer<typeof NestedNodeSchema>;

const CardBindingSchema = z
  .object({
    string_value: scrapedText,
    image_value: z
      .object({ url: scrapedText, width: scrapedNumber })
      .optional()
      .catch(undefined),
  })
  .catch({});

type CardBinding = z.infer<typeof CardBindingSchema>;

const BindingValuesSchema = z
  .union([
    z.array(
      z
        .object({
          key: scrapedText,
          value: CardBindingSchema.optional().catch(undefined),
        })
        .catch({ key: undefined, value: undefined }),
    ),
    z.record(z.string(), CardBindingSchema),
  ])
  .optional()
  .catch(undefined);

type BindingValues = z.infer<typeof BindingValuesSchema>;

const UserSchema = z
  .object({
    core: z
      .object({ screen_name: scrapedText, name: scrapedText })
      .optional()
      .catch(undefined),
    legacy: z
      .object({
        screen_name: scrapedText,
        name: scrapedText,
        profile_image_url_https: scrapedText,
      })
      .optional()
      .catch(undefined),
    avatar: z.object({ image_url: scrapedText }).optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

const TweetNodeSchema = z
  .object({
    __typename: scrapedText,
    rest_id: scrapedText,
    legacy: z
      .object({
        id_str: scrapedText,
        created_at: scrapedText,
        full_text: scrapedText,
        favorite_count: scrapedNumber,
        retweet_count: scrapedNumber,
        reply_count: scrapedNumber,
        quote_count: scrapedNumber,
        bookmark_count: scrapedNumber,
        in_reply_to_status_id_str: scrapedText,
        in_reply_to_screen_name: scrapedText,
        extended_entities: z
          .object({
            media: z.array(MediaEntrySchema).optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
        entities: z
          .object({
            media: z.array(MediaEntrySchema).optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    views: z.object({ count: scrapedText }).optional().catch(undefined),
    card: z
      .object({
        legacy: z
          .object({
            name: scrapedText,
            url: scrapedText,
            binding_values: BindingValuesSchema,
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    note_tweet: z
      .object({
        note_tweet_results: z
          .object({
            result: z.object({ text: scrapedText }).optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    core: z
      .object({ user_results: z.object({ result: UserSchema }).optional() })
      .optional()
      .catch(undefined),
    tweet: NestedNodeSchema,
    quoted_status_result: z
      .object({ result: NestedNodeSchema })
      .optional()
      .catch(undefined),
  })
  .catch({});

export type TweetNode = z.infer<typeof TweetNodeSchema>;

const TimelineEntrySchema = z
  .object({
    entryId: scrapedText,
    content: z
      .object({
        entryType: scrapedText,
        itemContent: z
          .object({
            __typename: scrapedText,
            tweet_results: z
              .object({ result: NestedNodeSchema })
              .optional()
              .catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

const TimelineInstructionSchema = z
  .object({
    type: scrapedText,
    entries: z.array(TimelineEntrySchema).optional().catch(undefined),
  })
  .catch({});

type TimelineInstruction = z.infer<typeof TimelineInstructionSchema>;

const TimelineSchema = z
  .object({
    timeline: z
      .object({
        instructions: z
          .array(TimelineInstructionSchema)
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);

const BookmarksResponseSchema = z
  .object({
    data: z
      .object({
        bookmark_timeline_v2: TimelineSchema,
        bookmark_collection_timeline: TimelineSchema,
        user: z
          .object({
            result: z
              .object({ timeline_v2: TimelineSchema, timeline: TimelineSchema })
              .optional()
              .catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export interface BookmarksCapture {
  url: string;
  body: string;
  status?: number;
}

interface RichTweetMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

interface RichTweetMetrics {
  likes: number;
  retweets: number;
  replies: number;
  quotes?: number;
  bookmarks?: number;
  views?: number;
}

interface RichTweetCard {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  large?: boolean;
}

export interface RichTweet {
  tweetId: string;
  url: string;
  bookmarkedAt?: string;
  fullText: string;
  author: { handle: string; name: string; avatarUrl?: string };
  media: RichTweetMedia[];
  metrics: RichTweetMetrics;
  quoted?: RichTweet;
  replyTo?: { tweetId: string; url: string; handle: string };
  card?: RichTweetCard;
  raw: TweetNode;
}

export function parseBookmarksResponses(
  captures: BookmarksCapture[],
): Map<string, RichTweet> {
  const out = new Map<string, RichTweet>();
  for (const cap of captures) {
    let json: unknown;
    try {
      json = JSON.parse(cap.body);
    } catch (err) {
      log.warn("[pond bookmarks] capture body not JSON", cap.url, err);
      continue;
    }
    const env = bookmarksEnvelope.safeParse(json);
    if (!env.success && !envelopeFailureLogged) {
      envelopeFailureLogged = true;
      log.warn(
        "[pond bookmarks] envelope schema drift",
        cap.url,
        env.error.issues.map((i) => i.path.join(".")).join(", "),
      );
    }
    const data = BookmarksResponseSchema.parse(json).data;
    const user = data?.user?.result;
    const instructions =
      data?.bookmark_timeline_v2?.timeline?.instructions ??
      data?.bookmark_collection_timeline?.timeline?.instructions ??
      user?.timeline_v2?.timeline?.instructions ??
      user?.timeline?.timeline?.instructions;
    if (!instructions) continue;
    for (const entry of iterateAddedEntries(instructions)) {
      const tweet = extractEntryTweet(entry);
      if (!tweet) continue;
      out.set(tweet.tweetId, tweet);
    }
  }
  return out;
}

function* iterateAddedEntries(
  instructions: TimelineInstruction[],
): Generator<TimelineEntry> {
  for (const ix of instructions) {
    if (ix.type !== "TimelineAddEntries") continue;
    for (const entry of ix.entries ?? []) {
      if (entry.content?.entryType !== "TimelineTimelineItem") continue;
      if (!entry.entryId?.startsWith("tweet-")) continue;
      yield entry;
    }
  }
}

function extractEntryTweet(entry: TimelineEntry): RichTweet | null {
  const itemContent = entry.content?.itemContent;
  if (itemContent?.__typename !== "TimelineTweet") return null;
  return resolveTweet(itemContent.tweet_results?.result);
}

function resolveTweet(raw: NestedNode): RichTweet | null {
  if (raw === undefined || raw === null) return null;
  const node = TweetNodeSchema.parse(raw);
  if (node.__typename === "Tweet") return richTweetFromNode(node);
  if (node.__typename === "TweetWithVisibilityResults") {
    return richTweetFromNode(TweetNodeSchema.parse(node.tweet ?? {}));
  }
  return null;
}

function richTweetFromNode(tweet: TweetNode): RichTweet | null {
  if (!tweet?.legacy?.id_str) return null;
  const tweetId = tweet.legacy.id_str;
  const handle = pickAuthorHandle(tweet);
  const avatarUrl = pickAuthorAvatar(tweet);
  const card = pickCard(tweet);

  const author: RichTweet["author"] = {
    handle: handle ?? "",
    name: pickAuthorName(tweet) ?? handle ?? "",
  };
  if (avatarUrl) author.avatarUrl = avatarUrl;

  const rich: RichTweet = {
    tweetId,
    url: handle
      ? `https://x.com/${handle}/status/${tweetId}`
      : `https://x.com/i/status/${tweetId}`,
    fullText: pickFullText(tweet),
    author,
    media: pickMedia(tweet),
    metrics: pickMetrics(tweet),
    quoted: tweet.quoted_status_result?.result
      ? (resolveTweet(tweet.quoted_status_result.result) ?? undefined)
      : undefined,
    raw: tweet,
  };
  if (card) rich.card = card;
  const replyId = tweet.legacy.in_reply_to_status_id_str;
  const replyHandle = tweet.legacy.in_reply_to_screen_name ?? "";
  if (replyId) {
    rich.replyTo = {
      tweetId: replyId,
      url: replyHandle
        ? `https://x.com/${replyHandle}/status/${replyId}`
        : `https://x.com/i/status/${replyId}`,
      handle: replyHandle,
    };
  }
  return rich;
}

function cardBindings(raw: BindingValues): Map<string, CardBinding> {
  const map = new Map<string, CardBinding>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry.key && entry.value) map.set(entry.key, entry.value);
    }
  } else if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (value) map.set(key, value);
    }
  }
  return map;
}

function pickCardImage(map: Map<string, CardBinding>): string | undefined {
  let best: { url: string; score: number } | null = null;
  for (const [key, value] of map) {
    const url = value.image_value?.url;
    if (url === undefined || url.length === 0) continue;
    if (!/image/i.test(key)) continue;
    let score = value.image_value?.width ?? 0;
    if (/original/i.test(key)) score += 100_000;
    else if (/large/i.test(key)) score += 50_000;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url;
}

function pickCard(tweet: TweetNode): RichTweetCard | undefined {
  const legacy = tweet.card?.legacy;
  if (!legacy) return undefined;
  const map = cardBindings(legacy.binding_values);
  const str = (k: string): string | undefined => {
    const v = map.get(k)?.string_value;
    return v !== undefined && v.trim().length > 0 ? v.trim() : undefined;
  };
  const title = str("title");
  const description = str("description");
  const domain = str("vanity_url") ?? str("domain");
  const url = str("card_url") ?? legacy.url;
  const imageUrl = pickCardImage(map);
  const large = legacy.name === "summary_large_image";

  if (!title && !imageUrl && !url) return undefined;
  const card: RichTweetCard = {};
  if (url) card.url = url;
  if (domain) card.domain = domain;
  if (title) card.title = title;
  if (description) card.description = description;
  if (imageUrl) card.imageUrl = imageUrl;
  if (large) card.large = large;
  return card;
}

function pickFullText(tweet: TweetNode): string {
  const note = tweet.note_tweet?.note_tweet_results?.result?.text;
  if (note && note.trim().length > 0) return note;
  return tweet.legacy?.full_text ?? "";
}

function pickAuthorHandle(tweet: TweetNode): string | null {
  const user = tweet.core?.user_results?.result;
  return user?.core?.screen_name || (user?.legacy?.screen_name ?? null);
}

function pickAuthorName(tweet: TweetNode): string | null {
  const user = tweet.core?.user_results?.result;
  return user?.core?.name || (user?.legacy?.name ?? null);
}

function pickAuthorAvatar(tweet: TweetNode): string | null {
  const user = tweet.core?.user_results?.result;
  const raw = user?.avatar?.image_url ?? user?.legacy?.profile_image_url_https;
  if (raw === undefined || raw.length === 0) return null;
  return raw.replace(/_normal(\.(?:jpg|jpeg|png|webp))/i, "_400x400$1");
}

function pickMedia(tweet: TweetNode): RichTweetMedia[] {
  const list =
    tweet.legacy?.extended_entities?.media ??
    tweet.legacy?.entities?.media ??
    [];
  const out: RichTweetMedia[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const mapped = mapMedia(item);
    if (!mapped) continue;
    if (seen.has(mapped.url)) continue;
    seen.add(mapped.url);
    out.push(mapped);
  }
  return out;
}

type MediaEntry = z.infer<typeof MediaEntrySchema>;

function mapMedia(item: MediaEntry): RichTweetMedia | null {
  if (!item.media_url_https) return null;
  const dims = pickDims(item);
  if (item.type === "video" || item.type === "animated_gif") {
    const best = pickBestVariant(item.video_info?.variants);
    const poster = upgradeTwimg(item.media_url_https);
    const ms = item.video_info?.duration_millis;
    const media: RichTweetMedia = {
      url: best ?? poster,
      type: "video",
      poster,
    };
    if (dims) {
      media.width = dims.width;
      media.height = dims.height;
    }
    if (ms !== undefined && ms > 0) media.durationSec = ms / 1000;
    return media;
  }
  const image: RichTweetMedia = {
    url: upgradeTwimg(item.media_url_https),
    type: "image",
  };
  if (dims) {
    image.width = dims.width;
    image.height = dims.height;
  }
  return image;
}

function pickDims(
  item: MediaEntry,
): { width: number; height: number } | undefined {
  const w = item.original_info?.width;
  const h = item.original_info?.height;
  if (w !== undefined && h !== undefined && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  const ar = item.video_info?.aspect_ratio;
  const arW = ar?.[0];
  const arH = ar?.[1];
  if (arW !== undefined && arH !== undefined && arW > 0 && arH > 0) {
    return { width: arW, height: arH };
  }
  return undefined;
}

function pickBestVariant(
  variants: Array<{ bitrate?: number; url?: string }> | undefined,
): string | null {
  if (!variants || variants.length === 0) return null;
  let best: { bitrate?: number; url?: string } | null = null;
  for (const v of variants) {
    if (!v.url) continue;
    if (!best || (v.bitrate ?? 0) > (best.bitrate ?? 0)) best = v;
  }
  return best?.url ?? null;
}

function upgradeTwimg(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "pbs.twimg.com") {
      u.searchParams.set("name", "orig");
      return u.toString();
    }
  } catch {}
  return url;
}

function pickMetrics(tweet: TweetNode): RichTweetMetrics {
  const legacy = tweet.legacy;
  const views = tweet.views?.count;
  return {
    likes: legacy?.favorite_count ?? 0,
    retweets: legacy?.retweet_count ?? 0,
    replies: legacy?.reply_count ?? 0,
    quotes: legacy?.quote_count,
    bookmarks: legacy?.bookmark_count,
    views: views ? Number.parseInt(views, 10) || undefined : undefined,
  };
}
