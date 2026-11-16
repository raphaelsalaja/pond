import type { XLink, XMedia, XPost } from "@pond/render";
import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { isAvatarUrl, stripTwitterShortUrls } from "@shared/tweet-card";

const isDataUrl = (url: string | undefined): url is string =>
  url?.startsWith("data:image/") === true;

/** ISO 8601 in the machine's zone, so xeet prints the time the reader saw. */
export function localIso(iso: string): string | undefined {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return undefined;
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

const TWITTER_EPOCH_MS = 1288834974657n;

/** X status ids are snowflakes, so a quote saved without its time still has one. */
function snowflakeIso(id: string | undefined): string | undefined {
  if (!id || !/^\d{15,20}$/.test(id)) return undefined;
  const ms = Number((BigInt(id) >> 22n) + TWITTER_EPOCH_MS);
  return new Date(ms).toISOString();
}

const URL_RE = /https?:\/\/[^\s…]+/g;

/** Page captures keep X's shortened link text ("example.com/a-long-pa…"); xeet shortens it again. */
function visibleText(text: string | undefined): string {
  return stripTwitterShortUrls(text ?? "").replace(
    /(https?:\/\/[^\s…]+)…/g,
    "$1",
  );
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function mapMedia(media: readonly CaptureMedia[]): XMedia[] {
  const out: XMedia[] = [];
  for (const m of media) {
    if (m.type === "link" || isAvatarUrl(m.url)) continue;
    const item: XMedia = {
      kind: m.type === "video" ? "video" : "image",
      width: m.width ?? 0,
      height: m.height ?? 0,
    };
    const data = m.type === "video" ? m.posterUrl : m.url;
    if (isDataUrl(data)) item.data = data;
    if (m.type === "video" && m.durationSec !== undefined)
      item.duration = m.durationSec;
    out.push(item);
  }
  return out;
}

function mapPost(
  capture: Capture,
  now: string | undefined,
  fallbackAuthor?: string | null,
): XPost {
  const handle =
    capture.author?.handle ?? fallbackAuthor?.replace(/^@/, "") ?? "";
  const post: XPost = {
    text: visibleText(capture.description),
    author: {
      name: capture.author?.name ?? fallbackAuthor ?? handle,
      handle,
      verified: capture.author?.verified ? "blue" : "none",
    },
  };
  if (isDataUrl(capture.author?.avatarUrl))
    post.author.avatar = capture.author.avatarUrl;
  const media = mapMedia(capture.media ?? []);
  if (media.length > 0) post.media = media;
  const published = capture.publishedAt ?? snowflakeIso(capture.id);
  const createdAt = published ? localIso(published) : undefined;
  if (createdAt) post.createdAt = createdAt;
  if (now) post.now = now;
  return post;
}

/**
 * xeet's input for an X save, or null when xeet can't draw it the way the
 * React card does: a reply whose parent was captured shows the parent above it.
 */
export function captureToXPost(
  capture: Capture,
  fallbackAuthor?: string | null,
  now: Date = new Date(),
): XPost | null {
  if (capture.replyTo?.description || capture.replyTo?.media.length)
    return null;
  const reference = localIso(now.toISOString());
  const post = mapPost(capture, reference, fallbackAuthor);

  if (capture.quoted) {
    const quote = mapPost(capture.quoted, reference);
    if (quote.text || quote.media?.length || quote.author.handle) {
      post.quote = quote;
      const quoted = new Set(
        capture.quoted.media.map((m) => m.posterUrl ?? m.url),
      );
      post.media = post.media?.filter((m) => !m.data || !quoted.has(m.data));
    }
  }

  const card = capture.card;
  if (card?.url && (card.title || card.imageUrl)) {
    const link: XLink = {
      card: card.large ? "summary_large_image" : "summary",
    };
    /** A page capture can put the card's title where its domain goes. */
    const domainIsTitle = card.domain !== undefined && /\s/.test(card.domain);
    const title = card.title ?? (domainIsTitle ? card.domain : undefined);
    if (title) link.title = title;
    if (card.description) link.description = card.description;
    if (card.domain && !domainIsTitle) link.domain = card.domain;
    if (isDataUrl(card.imageUrl))
      link.image = { width: 0, height: 0, data: card.imageUrl };
    /** X attaches the card to the last link in the text; a t.co card URL means that link was stripped. */
    const last = post.text.match(URL_RE)?.at(-1);
    const written =
      last &&
      (!link.domain || hostOf(last) === link.domain.replace(/^www\./, ""))
        ? last
        : undefined;
    const key = written ?? card.url;
    if (!link.domain && hostOf(key) === "t.co") link.domain = "";
    if (!written)
      post.text = post.text ? `${post.text}\n\n${card.url}` : card.url;
    post.links = { [key]: link };
  }

  if (capture.isReply && capture.replyingTo) {
    post.replyTo = capture.replyTo?.id ?? capture.conversationId ?? "0";
    post.replyToHandle = capture.replyingTo;
  }

  const m = capture.metrics;
  if (m) {
    post.counts = {
      replies: m.replies ?? m.comments ?? 0,
      reposts: m.retweets ?? 0,
      likes: m.likes ?? 0,
      views: m.views ?? 0,
      bookmarks: m.bookmarks ?? 0,
    };
  }
  return post;
}
