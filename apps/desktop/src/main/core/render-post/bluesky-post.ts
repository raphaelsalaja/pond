import type {
  BlueskyAuthor,
  BlueskyCard,
  BlueskyMedia,
  BlueskyPost,
  TextRun,
} from "@pond/render";
import type { Capture, CaptureFacet, CaptureMedia } from "@pond/schema/raw";

const isDataUrl = (url: string | undefined): url is string =>
  url?.startsWith("data:image/") === true;

/** Extras are stored JSON, so a facet from an older or hand-edited save is checked before use. */
function facetsOf(capture: Capture): CaptureFacet[] {
  const raw: unknown = capture.extras?.facets;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is CaptureFacet =>
      typeof f?.start === "number" &&
      typeof f?.end === "number" &&
      typeof f?.type === "string",
  );
}

/** bsky.app's `toShortUrl`: host plus at most 13 characters of path, then "...". */
function toShortUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    const path = (u.pathname === "/" ? "" : u.pathname) + u.search + u.hash;
    return path.length > 15
      ? `${u.host}${path.slice(0, 13)}...`
      : u.host + path;
  } catch {
    return url;
  }
}

/** Facet offsets are UTF-8 bytes into the record text. */
function facetRuns(
  text: string,
  facets: readonly CaptureFacet[],
): TextRun[] {
  const bytes = new TextEncoder().encode(text);
  const decode = (a: number, b: number) =>
    new TextDecoder().decode(bytes.subarray(a, b));
  const out: TextRun[] = [];
  let at = 0;
  for (const f of [...facets].sort((a, b) => a.start - b.start)) {
    if (f.start < at || f.end > bytes.length || f.end <= f.start) continue;
    if (f.start > at) out.push({ text: decode(at, f.start) });
    const segment = decode(f.start, f.end);
    out.push({
      text: f.type === "link" ? toShortUrl(segment) : segment,
      link: true,
    });
    at = f.end;
  }
  if (at < bytes.length) out.push({ text: decode(at, bytes.length) });
  return out;
}

/** bsky.app's `toNiceDomain`, which keeps `www.`. */
function niceDomain(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const SINGLE_EMOJI_RE =
  /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\uFE0F|\u200D)+$/u;

function author(a: Capture["author"], fallback: string): BlueskyAuthor {
  const handle = a?.handle ?? fallback;
  const out: BlueskyAuthor = { name: a?.name || handle, handle: `@${handle}` };
  if (a?.verified) out.verified = true;
  if (isDataUrl(a?.avatarUrl)) out.avatar = a.avatarUrl;
  return out;
}

function media(
  list: readonly CaptureMedia[],
  cardThumb: string | undefined,
): BlueskyMedia {
  const out: BlueskyMedia = { images: [] };
  for (const m of list) {
    if (m.type === "video") {
      out.video = { width: m.width, height: m.height };
      if (isDataUrl(m.posterUrl)) out.video.src = m.posterUrl;
    } else if (m.type === "image" && m.url !== cardThumb) {
      out.images.push(
        isDataUrl(m.url)
          ? { src: m.url, width: m.width, height: m.height }
          : { width: m.width, height: m.height },
      );
    }
  }
  out.images = out.images.slice(0, 4);
  return out;
}

function cardOf(card: Capture["card"]): BlueskyCard | undefined {
  if (!card?.url) return undefined;
  const out: BlueskyCard = {
    title: card.title || card.url,
    description: card.description ?? "",
    domain: niceDomain(card.url),
  };
  if (isDataUrl(card.imageUrl)) out.image = card.imageUrl;
  return out;
}

const timeShort = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dateMedium = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateShort = new Intl.DateTimeFormat(undefined);

/** `niceDate(…, 'dot separated')`. */
function niceDate(iso: string | undefined): string {
  const d = iso ? new Date(iso) : undefined;
  if (!d || !Number.isFinite(d.getTime())) return "";
  return `${timeShort.format(d)} · ${dateMedium.format(d)}`;
}

/** `useGetTimeAgo` in its narrow form: months are 30 days, a year or more is a date. */
function timeAgo(iso: string | undefined, now: Date): string {
  const d = iso ? new Date(iso) : undefined;
  if (!d || !Number.isFinite(d.getTime())) return "";
  const s = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 86_400 * 30) return `${Math.floor(s / 86_400)}d`;
  const months = Math.floor(s / (86_400 * 30));
  return months < 12 ? `${months}mo` : dateShort.format(d);
}

/** `formatPostStatCount`: compact, truncated, whole numbers from 10,000. */
function statCount(n: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: n >= 10_000 ? 0 : 1,
    roundingMode: "trunc",
  }).format(n);
}

const positive = (n: number | undefined) => (n && n > 0 ? statCount(n) : "");

/** The Bluesky layout's input for a save, drawn as bsky.app's post page shows it to a logged-out reader. */
export function captureToBlueskyPost(
  capture: Capture,
  fallbackAuthor?: string | null,
  now: Date = new Date(),
): BlueskyPost {
  const text = capture.description ?? "";
  const facets = facetsOf(capture);
  const post: BlueskyPost = {
    author: author(capture.author, fallbackAuthor?.replace(/^@/, "") ?? ""),
    text: facets.length > 0 ? facetRuns(text, facets) : text ? [{ text }] : [],
    media: media(capture.media ?? [], capture.card?.imageUrl),
    date: niceDate(capture.publishedAt),
    stats: [],
    controls: { replies: "", reposts: "", likes: "" },
  };
  if (facets.length === 0 && text.length <= 15 && SINGLE_EMOJI_RE.test(text))
    post.emojiOnly = true;

  const card = cardOf(capture.card);
  if (card) post.card = card;

  const q = capture.quoted;
  if (q) {
    post.quote = {
      author: author(q.author, ""),
      time: timeAgo(q.publishedAt, now),
      text: q.description ?? "",
      media: media(q.media ?? [], q.card?.imageUrl),
    };
    const quoteCard = cardOf(q.card);
    if (quoteCard) post.quote.card = quoteCard;
  }

  const m = capture.metrics ?? {};
  const stat = (n: number | undefined, one: string, other: string) => {
    if (n)
      post.stats.push({ value: statCount(n), label: n === 1 ? one : other });
  };
  stat(m.retweets, "repost", "reposts");
  stat(m.quotes, "quote", "quotes");
  stat(m.likes, "like", "likes");
  stat(m.bookmarks, "save", "saves");
  post.controls = {
    replies: positive(m.replies ?? m.comments),
    reposts: positive((m.retweets ?? 0) + (m.quotes ?? 0)),
    likes: positive(m.likes),
  };
  return post;
}
