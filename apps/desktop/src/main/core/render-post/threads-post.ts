import type {
  TextRun,
  ThreadsAuthor,
  ThreadsMedia,
  ThreadsNested,
  ThreadsPost,
} from "@pond/render";
import type {
  TweetCardAuthor,
  TweetCardData,
  TweetCardMedia,
  TweetCardMetrics,
} from "@shared/tweet-card";
import prettyMs from "pretty-ms";
import { systemLocale } from "../../lib/system-locale";

const isDataUrl = (url: string | undefined): url is string =>
  url?.startsWith("data:image/") === true;

/** The card's `Body` entity pattern, so links and mentions color the same in both renderers. */
const ENTITY = /(https?:\/\/[^\s]+|www\.[^\s]+|[@#$][\w]+)/g;

function prettifyUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return bare.length > 30 ? `${bare.slice(0, 30)}\u2026` : bare;
}

function textRuns(text: string): TextRun[] {
  const out: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(ENTITY)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const token = match[0];
    const linkText =
      token.startsWith("http") || token.startsWith("www.")
        ? prettifyUrl(token)
        : token;
    out.push({ text: linkText, link: true });
    last = idx + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function compact(value: number): string {
  return new Intl.NumberFormat(systemLocale(), {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}

function timestampLine(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const locale = systemLocale();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${time.format(d)} · ${date.format(d)}`;
}

function author(a: TweetCardAuthor): ThreadsAuthor {
  const out: ThreadsAuthor = {
    name: a.handle || a.name,
    initials: initials(a.name || a.handle || "?"),
  };
  if (a.verified) out.verified = true;
  if (isDataUrl(a.avatarUrl)) out.avatar = a.avatarUrl;
  return out;
}

function media(list: TweetCardMedia[] | undefined): ThreadsMedia[] {
  return (list ?? []).map((m) => {
    const out: ThreadsMedia = {};
    const src = m.type === "video" ? m.posterUrl : m.url;
    if (isDataUrl(src)) out.src = src;
    if (m.width && m.height) {
      out.width = m.width;
      out.height = m.height;
    }
    if (m.type === "video") {
      out.video = true;
      if (m.durationSec !== undefined) {
        out.duration = prettyMs(Math.max(0, Math.floor(m.durationSec)) * 1000, {
          colonNotation: true,
          secondsDecimalDigits: 0,
        });
      }
    }
    return out;
  });
}

function nested(data: TweetCardData, plain: boolean): ThreadsNested {
  const text = data.text ?? "";
  return {
    author: author(data.author),
    text: plain ? (text ? [{ text }] : []) : text ? textRuns(text) : [],
    media: media(data.media),
  };
}

const METRICS: { key: keyof TweetCardMetrics; icon: string }[] = [
  { key: "likes", icon: "threads-like" },
  { key: "replies", icon: "threads-reply" },
  { key: "retweets", icon: "threads-repost" },
  { key: "shares", icon: "threads-share" },
];

/**
 * The Threads layout's input for the data the React card draws, or null when only the
 * React card can draw it: a parent avatar that was never inlined would load from the web.
 */
export function cardDataToThreadsPost(data: TweetCardData): ThreadsPost | null {
  const parentAvatar = data.replyTo?.author.avatarUrl;
  if (parentAvatar && !isDataUrl(parentAvatar)) return null;

  const post: ThreadsPost = {
    ...nested(data, false),
    timestamp: timestampLine(data.publishedAt),
    metrics: [],
  };
  if (data.replyTo) post.parent = nested(data.replyTo, false);
  if (data.isReply && data.replyingTo && !data.replyTo)
    post.replyingTo = data.replyingTo;
  if (data.quoted) post.quoted = nested(data.quoted, true);
  if (data.card) {
    const c = data.card;
    post.card = {
      domain: c.domain ?? "",
      title: c.title ?? "",
      description: c.description ?? "",
      large: c.large === true,
    };
    if (isDataUrl(c.imageUrl)) post.card.image = c.imageUrl;
  }
  const m = data.metrics;
  if (m) {
    for (const { key, icon } of METRICS) {
      const value = m[key];
      if (value !== undefined)
        post.metrics.push({ icon, value: compact(value) });
    }
  }
  return post;
}
