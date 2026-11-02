import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { z } from "zod";

const TweetCardAuthorSchema = z.object({
  name: z.string(),
  handle: z.string(),
  avatarUrl: z.string().optional(),
  verified: z.boolean().optional(),
});

export type TweetCardAuthor = z.infer<typeof TweetCardAuthorSchema>;

const TweetCardMediaSchema = z.object({
  url: z.string(),
  type: z.enum(["image", "video"]),
  posterUrl: z.string().optional(),
  durationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  altText: z.string().optional(),
});

export type TweetCardMedia = z.infer<typeof TweetCardMediaSchema>;

const TweetCardMetricsSchema = z.object({
  replies: z.number().optional(),
  retweets: z.number().optional(),
  likes: z.number().optional(),
  views: z.number().optional(),
  bookmarks: z.number().optional(),
  shares: z.number().optional(),
});

export type TweetCardMetrics = z.infer<typeof TweetCardMetricsSchema>;

const TweetCardLinkSchema = z.object({
  url: z.string().optional(),
  domain: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  large: z.boolean().optional(),
});

export type TweetCardLink = z.infer<typeof TweetCardLinkSchema>;

export const TweetCardDataSchema = z.object({
  author: TweetCardAuthorSchema,
  text: z.string().optional(),
  publishedAt: z.string().optional(),
  lang: z.string().optional(),
  isReply: z.boolean().optional(),
  replyingTo: z.string().optional(),
  media: z.array(TweetCardMediaSchema).optional(),
  metrics: TweetCardMetricsSchema.optional(),
  get quoted() {
    return TweetCardDataSchema.optional();
  },
  get replyTo() {
    return TweetCardDataSchema.optional();
  },
  card: TweetCardLinkSchema.optional(),
});

export type TweetCardData = z.infer<typeof TweetCardDataSchema>;

/** X wraps media and cards as t.co; the native UI hides those tokens. */
export function stripTwitterShortUrls(text: string): string {
  return text
    .replace(/https?:\/\/t\.co\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visibleTweetText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const next = stripTwitterShortUrls(text);
  return next.length > 0 ? next : undefined;
}

function handleFromUrl(url: string): string | undefined {
  try {
    const first = new URL(url).pathname.split("/").filter(Boolean)[0];
    if (!first) return undefined;
    const handle = first.startsWith("@") ? first.slice(1) : first;
    return /^[A-Za-z0-9._]+$/.test(handle) ? handle : undefined;
  } catch {
    return undefined;
  }
}

export function isAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "pbs.twimg.com" && u.pathname.includes("/profile_images/")
    );
  } catch {
    return false;
  }
}

/** Hidden capture windows cannot load blob: posters harvested from X's <video> element. */
function isRenderableImageUrl(url: string): boolean {
  try {
    if (url.startsWith("data:image/")) return true;
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function mapMedia(
  media: readonly CaptureMedia[] | undefined,
): TweetCardMedia[] {
  if (!media) return [];
  const out: TweetCardMedia[] = [];
  for (const m of media) {
    if (m.type === "link") continue;
    if (isAvatarUrl(m.url)) continue;
    const poster =
      m.posterUrl !== undefined && isRenderableImageUrl(m.posterUrl)
        ? m.posterUrl
        : undefined;
    if (m.type === "video") {
      const video: TweetCardMedia = { url: m.url, type: "video" };
      if (poster) video.posterUrl = poster;
      if (m.durationSec !== undefined) video.durationSec = m.durationSec;
      if (m.width !== undefined) video.width = m.width;
      if (m.height !== undefined) video.height = m.height;
      out.push(video);
      continue;
    }
    if (!isRenderableImageUrl(m.url)) continue;
    const image: TweetCardMedia = { url: m.url, type: "image" };
    if (m.width !== undefined) image.width = m.width;
    if (m.height !== undefined) image.height = m.height;
    out.push(image);
  }
  return out;
}

function buildQuoted(quoted: Capture | undefined): TweetCardData | undefined {
  if (!quoted) return undefined;
  if (!quoted.description && !quoted.author && quoted.media.length === 0) {
    const handle = quoted.url ? handleFromUrl(quoted.url) : undefined;
    if (handle) return { author: { name: handle, handle } };
    return undefined;
  }
  const handle =
    quoted.author?.handle ??
    (quoted.url ? handleFromUrl(quoted.url) : undefined) ??
    "";
  const author: TweetCardAuthor = {
    name: quoted.author?.name ?? handle,
    handle,
  };
  if (quoted.author?.avatarUrl) author.avatarUrl = quoted.author.avatarUrl;

  const data: TweetCardData = { author };
  const quotedText = visibleTweetText(quoted.description);
  if (quotedText) data.text = quotedText;
  if (quoted.media.length > 0) data.media = mapMedia(quoted.media);
  return data;
}

function buildCard(capture: Capture): TweetCardLink | undefined {
  const c = capture.card;
  if (!c) return undefined;
  if (!c.url && !c.title && !c.imageUrl) return undefined;
  const link: TweetCardLink = {};
  if (c.url) link.url = c.url;
  if (c.domain) link.domain = c.domain;
  if (c.title) link.title = c.title;
  if (c.description) link.description = c.description;
  if (c.imageUrl) link.imageUrl = c.imageUrl;
  if (c.large === true) link.large = true;
  return link;
}

export function buildTweetCardData(
  capture: Capture | undefined | null,
  fallbackAuthor?: string | null,
): TweetCardData | null {
  if (!capture) return null;

  const author = capture.author ?? {};
  const handle =
    author.handle ??
    (fallbackAuthor ? fallbackAuthor.replace(/^@/, "") : undefined) ??
    "";
  const name = author.name ?? fallbackAuthor ?? handle;

  const cardAuthor: TweetCardAuthor = { name, handle };
  if (author.avatarUrl) cardAuthor.avatarUrl = author.avatarUrl;
  if (author.verified) cardAuthor.verified = true;

  const data: TweetCardData = { author: cardAuthor };
  const text = visibleTweetText(capture.description);
  if (text) data.text = text;
  if (capture.publishedAt) data.publishedAt = capture.publishedAt;
  if (capture.lang) data.lang = capture.lang;

  if (capture.isReply) data.isReply = true;
  if (capture.replyingTo) data.replyingTo = capture.replyingTo;

  const quoted = buildQuoted(capture.quoted);
  if (quoted) data.quoted = quoted;
  const replyTo = buildQuoted(capture.replyTo);
  if (replyTo && (replyTo.text || replyTo.media?.length)) {
    data.replyTo = replyTo;
  }

  const card = buildCard(capture);
  if (card) data.card = card;

  const quotedUrls = new Set((quoted?.media ?? []).map((m) => m.url));
  const media = mapMedia(capture.media).filter((m) => !quotedUrls.has(m.url));
  if (media.length > 0) data.media = media;

  if (capture.metrics) {
    const m = capture.metrics;
    const metrics: TweetCardMetrics = {};
    if (m.replies !== undefined) metrics.replies = m.replies;
    else if (m.comments !== undefined) metrics.replies = m.comments;
    if (m.retweets !== undefined) metrics.retweets = m.retweets;
    if (m.likes !== undefined) metrics.likes = m.likes;
    if (m.views !== undefined) metrics.views = m.views;
    if (m.bookmarks !== undefined) metrics.bookmarks = m.bookmarks;
    if (m.shares !== undefined) metrics.shares = m.shares;
    if (Object.keys(metrics).length > 0) data.metrics = metrics;
  }

  return data;
}
