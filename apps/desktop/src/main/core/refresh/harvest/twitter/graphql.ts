/**
 * Pure parser for Twitter Bookmarks GraphQL responses captured by the
 * preload XHR hook ([`apps/desktop/src/preload/scrape.cjs.ts`](apps/desktop/src/preload/scrape.cjs.ts)).
 *
 * The wire shape mirrors what Twitter ships from
 * `/i/api/graphql/<queryId>/Bookmarks`:
 *
 * ```
 * data
 *  └─ bookmark_timeline_v2
 *      └─ timeline
 *          └─ instructions[]              ← we want the TimelineAddEntries one
 *              └─ entries[]               ← each is either a tweet or a cursor
 *                  └─ content
 *                      ├─ entryType       ← we want "TimelineTimelineItem"
 *                      └─ itemContent
 *                          └─ tweet_results
 *                              └─ result  ← Tweet | TweetWithVisibilityResults | Tombstone
 * ```
 *
 * We follow the exact same path the prinsss exporter walks; see
 * [`twitter-web-exporter/src/utils/api.ts`](https://github.com/prinsss/twitter-web-exporter/blob/main/src/utils/api.ts)
 * `extractDataFromResponse` and `extractTweetUnion` for the canonical
 * implementation. This file is a slimmer port that only emits the
 * fields the harvester needs, plus the verbatim `Tweet` blob for
 * future-proofing (it goes into `saves.raw.twitter`).
 */

import log from "electron-log/main.js";
import { z } from "zod";

// Validates the path down to `instructions[]` only — entry shapes
// below that are union-typed and handled by the walker. Surfaces a
// structured error the first time Twitter ships a breaking shape
// change instead of silently returning 0 tweets.
const bookmarksEnvelope = z.object({
  data: z.object({
    bookmark_timeline_v2: z.object({
      timeline: z.object({
        instructions: z.array(z.object({ type: z.string() }).passthrough()),
      }),
    }),
  }),
});

let envelopeFailureLogged = false;

export interface BookmarksCapture {
  url: string;
  body: string;
  status?: number;
}

export interface RichTweetMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
}

export interface RichTweetMetrics {
  likes: number;
  retweets: number;
  replies: number;
  quotes?: number;
  bookmarks?: number;
  views?: number;
}

export interface RichTweet {
  tweetId: string;
  url: string;
  bookmarkedAt?: string;
  fullText: string;
  author: { handle: string; name: string };
  media: RichTweetMedia[];
  metrics: RichTweetMetrics;
  /** Quote-tweet payload, when the bookmark quotes another tweet. */
  quoted?: RichTweet;
  /** Verbatim Tweet object — stored on `saves.raw.twitter` for later. */
  raw: unknown;
}

/**
 * Parse every captured Bookmarks response, returning a deduplicated
 * map keyed by tweet id. Last-write-wins on duplicates — the most
 * recent capture wins, which matters when Twitter ships engagement
 * counter updates as the page sits open.
 */
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
    // Guardrail: log once per process when the envelope drifts, then
    // fall through to the manual walker so we still get whatever
    // tweets do match. Twitter ships small schema tweaks fairly often
    // and we'd rather degrade than fail outright.
    const env = bookmarksEnvelope.safeParse(json);
    if (!env.success && !envelopeFailureLogged) {
      envelopeFailureLogged = true;
      log.warn(
        "[pond bookmarks] envelope schema drift",
        cap.url,
        env.error.issues.map((i) => i.path.join(".")).join(", "),
      );
    }
    const instructions = pickInstructions(json);
    if (!instructions) continue;
    for (const entry of iterateAddedEntries(instructions)) {
      const tweet = extractEntryTweet(entry);
      if (!tweet) continue;
      out.set(tweet.tweetId, tweet);
    }
  }
  return out;
}

interface InstructionLike {
  type?: string;
  entries?: unknown[];
}

interface EntryLike {
  entryId?: string;
  sortIndex?: string;
  content?: {
    entryType?: string;
    itemContent?: {
      __typename?: string;
      tweet_results?: { result?: unknown };
    };
  };
}

function pickInstructions(json: unknown): InstructionLike[] | null {
  const data = (json as { data?: unknown })?.data;
  const timeline = (
    data as { bookmark_timeline_v2?: { timeline?: { instructions?: unknown } } }
  )?.bookmark_timeline_v2?.timeline?.instructions;
  return Array.isArray(timeline) ? (timeline as InstructionLike[]) : null;
}

function* iterateAddedEntries(
  instructions: InstructionLike[],
): Generator<EntryLike> {
  for (const ix of instructions) {
    if (ix.type !== "TimelineAddEntries") continue;
    if (!Array.isArray(ix.entries)) continue;
    for (const entry of ix.entries as EntryLike[]) {
      if (entry.content?.entryType !== "TimelineTimelineItem") continue;
      if (!entry.entryId?.startsWith("tweet-")) continue;
      yield entry;
    }
  }
}

function extractEntryTweet(entry: EntryLike): RichTweet | null {
  const itemContent = entry.content?.itemContent;
  if (itemContent?.__typename !== "TimelineTweet") return null;
  const result = itemContent.tweet_results?.result;
  return resolveTweet(result);
}

/**
 * Unwrap the `tweet_results.result` union. Tweets with visibility
 * limitations are wrapped in a `TweetWithVisibilityResults` object;
 * tombstones / unavailable tweets are silently skipped.
 */
function resolveTweet(result: unknown): RichTweet | null {
  const node = result as
    | { __typename?: string; tweet?: unknown; legacy?: unknown }
    | undefined;
  if (!node || typeof node !== "object") return null;

  if (node.__typename === "Tweet") {
    return shapeRichTweet(node);
  }
  if (node.__typename === "TweetWithVisibilityResults") {
    return shapeRichTweet(node.tweet);
  }
  if (
    node.__typename === "TweetTombstone" ||
    node.__typename === "TweetUnavailable"
  ) {
    return null;
  }
  return null;
}

interface TweetLike {
  rest_id?: string;
  legacy?: {
    id_str?: string;
    full_text?: string;
    favorite_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    extended_entities?: { media?: MediaLike[] };
    entities?: { media?: MediaLike[] };
  };
  views?: { count?: string };
  note_tweet?: {
    note_tweet_results?: { result?: { text?: string } };
  };
  core?: {
    user_results?: {
      result?: {
        core?: { screen_name?: string; name?: string };
        legacy?: { screen_name?: string; name?: string };
      };
    };
  };
  quoted_status_result?: { result?: unknown };
}

interface MediaLike {
  media_url_https?: string;
  url?: string;
  type?: "photo" | "video" | "animated_gif";
  video_info?: {
    variants?: Array<{ bitrate?: number; url?: string; content_type?: string }>;
  };
}

function shapeRichTweet(raw: unknown): RichTweet | null {
  const tweet = raw as TweetLike | undefined;
  if (!tweet?.legacy?.id_str) return null;
  const tweetId = tweet.legacy.id_str;
  const handle = pickAuthorHandle(tweet);
  const url = handle
    ? `https://x.com/${handle}/status/${tweetId}`
    : `https://x.com/i/status/${tweetId}`;

  return {
    tweetId,
    url,
    fullText: pickFullText(tweet),
    author: {
      handle: handle ?? "",
      name: pickAuthorName(tweet) ?? handle ?? "",
    },
    media: pickMedia(tweet),
    metrics: pickMetrics(tweet),
    quoted: tweet.quoted_status_result?.result
      ? (resolveTweet(tweet.quoted_status_result.result) ?? undefined)
      : undefined,
    raw: tweet,
  };
}

/**
 * Twitter ships truncated text in `legacy.full_text` and the full
 * untruncated body in `note_tweet.note_tweet_results.result.text`
 * for long-form tweets. Prefer the latter when present.
 */
function pickFullText(tweet: TweetLike): string {
  const note = tweet.note_tweet?.note_tweet_results?.result?.text;
  if (note && note.trim().length > 0) return note;
  return tweet.legacy?.full_text ?? "";
}

function pickAuthorHandle(tweet: TweetLike): string | null {
  const core = tweet.core?.user_results?.result?.core?.screen_name;
  if (core) return core;
  const legacy = tweet.core?.user_results?.result?.legacy?.screen_name;
  return legacy ?? null;
}

function pickAuthorName(tweet: TweetLike): string | null {
  const core = tweet.core?.user_results?.result?.core?.name;
  if (core) return core;
  const legacy = tweet.core?.user_results?.result?.legacy?.name;
  return legacy ?? null;
}

function pickMedia(tweet: TweetLike): RichTweetMedia[] {
  // `extended_entities` is the canonical media list; `entities` is a
  // legacy fallback Twitter sometimes ships when the tweet has only
  // one media item.
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

function mapMedia(item: MediaLike): RichTweetMedia | null {
  if (!item.media_url_https) return null;
  if (item.type === "video" || item.type === "animated_gif") {
    const best = pickBestVariant(item.video_info?.variants);
    const poster = upgradeTwimg(item.media_url_https);
    return {
      url: best ?? poster,
      type: "video",
      poster,
    };
  }
  return {
    url: upgradeTwimg(item.media_url_https),
    type: "image",
  };
}

function pickBestVariant(
  variants: Array<{ bitrate?: number; url?: string }> | undefined,
): string | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  let best: { bitrate?: number; url?: string } | null = null;
  for (const v of variants) {
    if (!v.url) continue;
    if (!best || (v.bitrate ?? 0) > (best.bitrate ?? 0)) best = v;
  }
  return best?.url ?? null;
}

/**
 * Upgrade `pbs.twimg.com` URLs to original quality. Mirrors the
 * `?name=orig` trick the DOM walker in `twitter/list.ts` uses for
 * its cover images.
 */
function upgradeTwimg(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "pbs.twimg.com") {
      u.searchParams.set("name", "orig");
      return u.toString();
    }
  } catch {
    /* leave as-is */
  }
  return url;
}

function pickMetrics(tweet: TweetLike): RichTweetMetrics {
  const legacy = tweet.legacy ?? {};
  const views = tweet.views?.count;
  return {
    likes: legacy.favorite_count ?? 0,
    retweets: legacy.retweet_count ?? 0,
    replies: legacy.reply_count ?? 0,
    quotes: legacy.quote_count,
    bookmarks: legacy.bookmark_count,
    views: views ? Number.parseInt(views, 10) || undefined : undefined,
  };
}
