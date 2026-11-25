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
import { systemLocale } from "../../lib/system-locale";

const isDataUrl = (url: string | undefined): url is string =>
  url?.startsWith("data:image/") === true;

/** The card's `Body` entity pattern, so links and mentions color the same in both renderers. */
const ENTITY = /(https?:\/\/[^\s]+|www\.[^\s]+|[@#$][\w]+)/g;

function prettifyUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return bare.length > 30 ? `${bare.slice(0, 30)}\u2026` : bare;
}

function textRuns(text: string): Array<TextRun> {
  const out: Array<TextRun> = [];
  let last = 0;
  for (const match of text.matchAll(ENTITY)) {
    const idx = match.index ?? 0;
    if (idx > last) {
      out.push({ text: text.slice(last, idx) });
    }
    const token = match[0];
    const linkText =
      token.startsWith("http") || token.startsWith("www.")
        ? prettifyUrl(token)
        : token;
    out.push({ text: linkText, link: true });
    last = idx + token.length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last) });
  }
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const two = (n: number) => String(n).padStart(2, "0");

/** The post header's age at render time: `42m`, `18h`, `3d`, then `11/18/26` from a week on. */
function relativeTime(value: string | undefined, now = Date.now()): string {
  if (!value) {
    return "";
  }
  const then = new Date(value);
  const ms = now - then.getTime();
  if (!Number.isFinite(ms)) {
    return "";
  }
  if (ms < MINUTE) {
    return `${Math.max(0, Math.floor(ms / 1000))}s`;
  }
  if (ms < HOUR) {
    return `${Math.floor(ms / MINUTE)}m`;
  }
  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)}h`;
  }
  if (ms < 7 * DAY) {
    return `${Math.floor(ms / DAY)}d`;
  }
  return `${two(then.getMonth() + 1)}/${two(then.getDate())}/${two(then.getFullYear() % 100)}`;
}

function author(a: TweetCardAuthor): ThreadsAuthor {
  const out: ThreadsAuthor = {
    name: a.handle || a.name,
    initials: initials(a.name || a.handle || "?"),
  };
  if (a.verified) {
    out.verified = true;
  }
  if (isDataUrl(a.avatarUrl)) {
    out.avatar = a.avatarUrl;
  }
  return out;
}

function media(list: Array<TweetCardMedia> | undefined): Array<ThreadsMedia> {
  return (list ?? []).map((m) => {
    const out: ThreadsMedia = {};
    const src = m.type === "video" ? m.posterUrl : m.url;
    if (isDataUrl(src)) {
      out.src = src;
    }
    if (m.width && m.height) {
      out.width = m.width;
      out.height = m.height;
    }
    if (m.type === "video") {
      out.video = true;
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

const METRICS: Array<{ key: keyof TweetCardMetrics; icon: string }> = [
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
  if (parentAvatar && !isDataUrl(parentAvatar)) {
    return null;
  }

  const post: ThreadsPost = {
    ...nested(data, false),
    time: relativeTime(data.publishedAt),
    metrics: [
      ...METRICS.map(({ key, icon }) => {
        const value = data.metrics?.[key];
        return { icon, value: value ? compact(value) : "" };
      }),
      /** threads.com shows Save without a count. */
      { icon: "threads-save", value: "" },
    ],
  };
  if (data.replyTo) {
    post.parent = nested(data.replyTo, false);
  }
  if (data.quoted) {
    post.quoted = nested(data.quoted, true);
  }
  if (data.card) {
    const c = data.card;
    post.card = {
      domain: c.domain ?? "",
      title: c.title ?? "",
      description: c.description ?? "",
      large: c.large === true,
    };
    if (isDataUrl(c.imageUrl)) {
      post.card.image = c.imageUrl;
    }
  }
  return post;
}
