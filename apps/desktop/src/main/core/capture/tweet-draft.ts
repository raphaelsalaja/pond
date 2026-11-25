import type {
  Capture,
  CaptureAuthor,
  CaptureLinkCard,
  CaptureMedia,
  CaptureMetrics,
} from "@pond/schema/raw";
import { QUOTE_DEPTH_CAP } from "@pond/schema/raw";
import { z } from "zod";
import { pickTitle } from "../refresh/harvest/lib/title";

export interface TweetDraft {
  source: "twitter" | "threads";
  id: string;
  url: string;
  text?: string;
  title?: string;
  author?: CaptureAuthor;
  publishedAt?: string;
  lang?: string;
  media: Array<CaptureMedia>;
  metrics?: CaptureMetrics;
  quoted?: TweetDraft;
  replyTo?: TweetDraft;
  card?: CaptureLinkCard;
  isReply?: boolean;
  replyingTo?: string;
  conversationId?: string;
}

export function captureFromTweetDraft(draft: TweetDraft, depth = 0): Capture {
  const title = draft.title ?? pickTitle(draft.text ?? "") ?? undefined;
  const author = compactAuthor(draft.author);
  const quoted =
    draft.quoted && depth < QUOTE_DEPTH_CAP
      ? captureFromTweetDraft(draft.quoted, depth + 1)
      : undefined;
  const replyTo =
    draft.replyTo && depth < QUOTE_DEPTH_CAP
      ? captureFromTweetDraft(draft.replyTo, depth + 1)
      : undefined;
  const card = compactCard(draft.card);
  const metrics = compactMetrics(draft.metrics);

  const capture: Capture = {
    id: draft.id,
    source: draft.source,
    url: draft.url,
    media: draft.media,
  };
  if (title) capture.title = title;
  if (draft.text) capture.description = draft.text;
  if (author) capture.author = author;
  if (draft.publishedAt) capture.publishedAt = draft.publishedAt;
  if (draft.lang) capture.lang = draft.lang;
  if (metrics) capture.metrics = metrics;
  if (quoted) capture.quoted = quoted;
  if (replyTo) capture.replyTo = replyTo;
  if (card) capture.card = card;
  if (draft.isReply) capture.isReply = true;
  if (draft.replyingTo) capture.replyingTo = draft.replyingTo;
  if (draft.conversationId) capture.conversationId = draft.conversationId;
  return capture;
}

function compactAuthor(
  author: CaptureAuthor | undefined,
): CaptureAuthor | undefined {
  if (!author) return undefined;
  const next: CaptureAuthor = {};
  if (author.name) next.name = author.name;
  if (author.handle) next.handle = author.handle;
  if (author.avatarUrl) next.avatarUrl = author.avatarUrl;
  if (author.profileUrl) next.profileUrl = author.profileUrl;
  if (author.verified) next.verified = true;
  return Object.keys(next).length > 0 ? next : undefined;
}

function compactCard(
  card: CaptureLinkCard | undefined,
): CaptureLinkCard | undefined {
  if (!card) return undefined;
  const next: CaptureLinkCard = {};
  if (card.url) next.url = card.url;
  if (card.domain) next.domain = card.domain;
  if (card.title) next.title = card.title;
  if (card.description) next.description = card.description;
  if (card.imageUrl) next.imageUrl = card.imageUrl;
  if (card.large) next.large = true;
  if (!next.url && !next.title && !next.imageUrl) return undefined;
  return next;
}

function compactMetrics(
  metrics: CaptureMetrics | undefined,
): CaptureMetrics | undefined {
  if (!metrics) return undefined;
  return Object.keys(metrics).length > 0 ? { ...metrics } : undefined;
}

export interface RichPostMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface RichPostDraft {
  source: "twitter" | "threads";
  id: string;
  url: string;
  text: string;
  author: {
    handle: string;
    name: string;
    avatarUrl?: string;
    verified?: boolean;
  };
  media: Array<RichPostMedia>;
  metrics?: CaptureMetrics;
  quoted?: RichPostDraft;
  replyTo?: RichPostDraft;
  card?: CaptureLinkCard;
  isReply?: boolean;
  replyingTo?: string;
  publishedAt?: string;
}

export function draftFromRichPost(rich: RichPostDraft): TweetDraft {
  const author: CaptureAuthor = {};
  if (rich.author.name) author.name = rich.author.name;
  if (rich.author.handle) author.handle = rich.author.handle;
  if (rich.author.avatarUrl) author.avatarUrl = rich.author.avatarUrl;
  if (rich.author.verified) author.verified = true;

  const draft: TweetDraft = {
    source: rich.source,
    id: rich.id,
    url: rich.url,
    text: rich.text,
    author,
    media: rich.media.map(mediaFromRich),
  };
  if (rich.publishedAt) draft.publishedAt = rich.publishedAt;
  if (rich.metrics) draft.metrics = rich.metrics;
  if (rich.quoted) draft.quoted = draftFromRichPost(rich.quoted);
  if (rich.replyTo) draft.replyTo = draftFromRichPost(rich.replyTo);
  if (rich.card) draft.card = rich.card;
  if (rich.isReply) draft.isReply = true;
  if (rich.replyingTo) draft.replyingTo = rich.replyingTo;
  return draft;
}

function mediaFromRich(m: RichPostMedia): CaptureMedia {
  const media: CaptureMedia = {
    url: m.url,
    type: m.type === "video" ? "video" : "image",
  };
  if (m.poster) media.posterUrl = m.poster;
  if (m.width !== undefined) media.width = m.width;
  if (m.height !== undefined) media.height = m.height;
  if (m.durationSec !== undefined) media.durationSec = m.durationSec;
  return media;
}

const scrapedText = z.string().optional().catch(undefined);
const scrapedNumber = z.number().optional().catch(undefined);
const scrapedFlag = z.boolean().optional().catch(undefined);

const HarvestMediaSchema = z
  .object({
    url: scrapedText,
    type: scrapedText,
    poster: scrapedText,
    width: scrapedNumber,
    height: scrapedNumber,
    durationSec: scrapedNumber,
  })
  .catch({});

type HarvestMedia = z.infer<typeof HarvestMediaSchema>;

const scrapedMedia = z.array(HarvestMediaSchema).optional().catch(undefined);

const HarvestMetricsSchema = z
  .object({
    likes: scrapedNumber,
    retweets: scrapedNumber,
    replies: scrapedNumber,
    quotes: scrapedNumber,
    views: scrapedNumber,
    bookmarks: scrapedNumber,
    comments: scrapedNumber,
    plays: scrapedNumber,
  })
  .optional()
  .catch(undefined);

const HarvestCardSchema = z
  .object({
    url: scrapedText,
    domain: scrapedText,
    title: scrapedText,
    description: scrapedText,
    imageUrl: scrapedText,
    large: scrapedFlag,
  })
  .optional()
  .catch(undefined);

const HarvestQuotedTweetSchema = z
  .object({
    tweetId: scrapedText,
    url: scrapedText,
    text: scrapedText,
    author: scrapedText,
    authorName: scrapedText,
    authorAvatar: scrapedText,
    media: scrapedMedia,
  })
  .optional()
  .catch(undefined);

type HarvestQuotedTweet = NonNullable<z.infer<typeof HarvestQuotedTweetSchema>>;

const DomHarvestMetaSchema = z
  .object({
    authorName: scrapedText,
    authorAvatar: scrapedText,
    authorUrl: scrapedText,
    verified: scrapedFlag,
    publishedAt: scrapedText,
    media: scrapedMedia,
    metrics: HarvestMetricsSchema,
    quotedTweet: HarvestQuotedTweetSchema,
    card: HarvestCardSchema,
    isReply: scrapedFlag,
    replyingTo: scrapedText,
    replyTo: HarvestQuotedTweetSchema,
    conversationId: scrapedText,
  })
  .catch({});

export interface DomHarvestPage {
  source: "twitter" | "threads";
  id: string;
  url: string;
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrls?: Array<{ url: string; type?: string; poster?: string }>;
  meta?: unknown;
}

export function draftFromDomHarvest(page: DomHarvestPage): TweetDraft {
  const meta = DomHarvestMetaSchema.parse(page.meta ?? {});
  const author: CaptureAuthor = {};
  if (meta.authorName !== undefined) author.name = meta.authorName;
  if (page.author !== undefined) author.handle = page.author.replace(/^@/, "");
  if (meta.authorAvatar !== undefined) author.avatarUrl = meta.authorAvatar;
  if (meta.authorUrl !== undefined) author.profileUrl = meta.authorUrl;
  if (meta.verified === true) author.verified = true;

  const draft: TweetDraft = {
    source: page.source,
    id: page.id,
    url: page.url,
    author,
    media: buildMedia(meta.media, page.mediaUrls),
    metrics: pickMetrics(meta.metrics),
  };
  if (page.description) draft.text = page.description;
  if (page.title) draft.title = page.title;
  if (meta.publishedAt !== undefined) draft.publishedAt = meta.publishedAt;
  if (page.lang) draft.lang = page.lang;
  if (meta.quotedTweet) {
    draft.quoted = draftFromQuotedMeta(page.source, meta.quotedTweet);
  }
  if (meta.replyTo) {
    draft.replyTo = draftFromQuotedMeta(page.source, meta.replyTo);
    draft.isReply = true;
  }
  if (meta.card) draft.card = meta.card;
  if (meta.isReply === true) draft.isReply = true;
  if (meta.replyingTo !== undefined) draft.replyingTo = meta.replyingTo;
  if (meta.conversationId !== undefined) {
    draft.conversationId = meta.conversationId;
  }
  return draft;
}

function draftFromQuotedMeta(
  source: "twitter" | "threads",
  quoted: HarvestQuotedTweet,
): TweetDraft {
  const handle = quoted.author?.replace(/^@/, "");
  const author: CaptureAuthor = {};
  if (quoted.authorName !== undefined) author.name = quoted.authorName;
  if (handle) author.handle = handle;
  if (quoted.authorAvatar !== undefined) author.avatarUrl = quoted.authorAvatar;

  const draft: TweetDraft = {
    source,
    id: quoted.tweetId ?? quoted.url ?? "quoted",
    url: quoted.url ?? "",
    author,
    media: buildMedia(quoted.media, undefined),
  };
  if (quoted.text !== undefined) draft.text = quoted.text;
  return draft;
}

function buildMedia(
  metaMedia: Array<HarvestMedia> | undefined,
  mediaUrls: Array<{ url: string; type?: string; poster?: string }> | undefined,
): Array<CaptureMedia> {
  const out: Array<CaptureMedia> = [];
  const seen = new Set<string>();
  const push = (m: CaptureMedia): void => {
    if (seen.has(m.url)) return;
    seen.add(m.url);
    out.push(m);
  };
  let sawRich = false;
  for (const m of metaMedia ?? []) {
    if (m.url === undefined) continue;
    sawRich = true;
    const media: CaptureMedia = {
      url: m.url,
      type: m.type === "video" ? "video" : "image",
    };
    if (m.poster !== undefined) media.posterUrl = m.poster;
    if (m.width !== undefined) media.width = m.width;
    if (m.height !== undefined) media.height = m.height;
    if (m.durationSec !== undefined) media.durationSec = m.durationSec;
    push(media);
  }
  if (sawRich) return out;
  for (const m of mediaUrls ?? []) {
    const media: CaptureMedia = {
      url: m.url,
      type: m.type === "video" ? "video" : "image",
    };
    if (m.poster) media.posterUrl = m.poster;
    push(media);
  }
  return out;
}

function pickMetrics(
  metrics: z.infer<typeof HarvestMetricsSchema>,
): CaptureMetrics | undefined {
  if (!metrics) return undefined;
  const out: CaptureMetrics = {};
  for (const key of [
    "likes",
    "retweets",
    "replies",
    "quotes",
    "views",
    "bookmarks",
    "comments",
    "plays",
  ] as const) {
    const v = metrics[key];
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
