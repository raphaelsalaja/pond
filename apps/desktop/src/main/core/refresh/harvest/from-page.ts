import { MEDIA_TYPES } from "@pond/schema/db";
import type { Source } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import type {
  Capture,
  CaptureAuthor,
  CaptureExtras,
  CaptureMedia,
  CaptureMetrics,
  CaptureUpstream,
} from "@pond/schema/raw";
import { z } from "zod";

export interface HarvestAdaptCtx {
  source: Source;
  url: string;
  sourceId: string;
}

const scrapedText = z.string().optional().catch(undefined);
const scrapedNumber = z.number().optional().catch(undefined);
const scrapedFlag = z.boolean().optional().catch(undefined);

const METRIC_KEYS = [
  "likes",
  "views",
  "plays",
  "comments",
  "replies",
  "retweets",
  "quotes",
  "bookmarks",
  "shares",
] as const;

const METRIC_FIELDS = {
  likes: scrapedNumber,
  views: scrapedNumber,
  plays: scrapedNumber,
  comments: scrapedNumber,
  replies: scrapedNumber,
  retweets: scrapedNumber,
  quotes: scrapedNumber,
  bookmarks: scrapedNumber,
  shares: scrapedNumber,
};

const PageMetaSchema = z.looseObject({
  ...METRIC_FIELDS,
  lang: scrapedText,
  authorName: scrapedText,
  authorAvatar: scrapedText,
  authorUrl: scrapedText,
  verified: scrapedFlag,
  publishedAt: scrapedText,
  durationSec: scrapedNumber,
  upstreamUrl: scrapedText,
  metrics: z.object(METRIC_FIELDS).optional().catch(undefined),
  subreddit: scrapedText,
  tileType: scrapedText,
  clusters: z.json().optional().catch(undefined),
  publisher: scrapedText,
  faviconUrl: scrapedText,
  blockClass: scrapedText,
});

type PageMeta = z.infer<typeof PageMetaSchema>;

const PageBlobSchema = z
  .object({
    title: scrapedText,
    description: scrapedText,
    author: scrapedText,
    lang: scrapedText,
    mediaUrl: scrapedText,
    mediaUrls: z
      .array(
        z
          .object({
            url: z.string(),
            type: z.enum(MEDIA_TYPES).optional().catch(undefined),
            poster: scrapedText,
          })
          .nullable()
          .catch(null),
      )
      .transform((items) => items.filter((m) => m !== null))
      .optional()
      .catch(undefined),
    mediaType: z.enum(MEDIA_TYPES).optional().catch(undefined),
    meta: PageMetaSchema.optional().catch(undefined),
  })
  .catch({});

export type PageBlob = z.infer<typeof PageBlobSchema>;

export interface PageBlobInput {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url?: string; type?: string; poster?: string }>;
  mediaType?: string;
  meta?: unknown;
}

export function parsePageBlob(raw: JsonValue | PageBlobInput): PageBlob | null {
  const blob = PageBlobSchema.parse(raw);
  if (!blob.title && !blob.description && !blob.mediaUrl && !blob.author) {
    return null;
  }
  const page: PageBlob = {
    lang: blob.lang ?? blob.meta?.lang,
    mediaUrls: blob.mediaUrls,
    mediaType: blob.mediaType,
  };
  if (blob.title) page.title = blob.title;
  if (blob.description) page.description = blob.description;
  if (blob.author) page.author = blob.author;
  if (blob.mediaUrl) page.mediaUrl = blob.mediaUrl;
  if (blob.meta) page.meta = blob.meta;
  return page;
}

export function captureFromPageDom(
  raw: JsonValue,
  ctx: HarvestAdaptCtx,
): Capture | null {
  const page = parsePageBlob(raw);
  if (!page) return null;
  const meta = page.meta ?? {};
  const author = authorFromPage(page.author, meta);
  const metrics = metricsFromMeta(meta);
  const extras = extrasFromMeta(meta);
  const upstream = upstreamFromMeta(meta);

  const capture: Capture = {
    id: ctx.sourceId,
    source: ctx.source,
    url: ctx.url,
    media: mediaFromPage(page, ctx),
  };
  if (page.title) capture.title = page.title;
  if (page.description) capture.description = page.description;
  if (author) capture.author = author;
  if (meta.publishedAt !== undefined) capture.publishedAt = meta.publishedAt;
  if (page.lang) capture.lang = page.lang;
  if (metrics) capture.metrics = metrics;
  if (meta.durationSec !== undefined) capture.duration = meta.durationSec;
  if (upstream) capture.upstream = upstream;
  if (extras) capture.extras = extras;
  return capture;
}

function mediaFromPage(
  page: PageBlob,
  ctx: HarvestAdaptCtx,
): Array<CaptureMedia> {
  if (ctx.source === "youtube") {
    const posterUrl =
      page.mediaUrl && page.mediaUrl.length > 0
        ? page.mediaUrl
        : `https://i.ytimg.com/vi/${ctx.sourceId}/hqdefault.jpg`;
    return [{ url: ctx.url, type: "video", posterUrl }];
  }

  const media: Array<CaptureMedia> = (page.mediaUrls ?? []).map((m) => {
    const entry: CaptureMedia = {
      url: m.url,
      type: m.type === "video" ? "video" : "image",
    };
    if (m.poster) entry.posterUrl = m.poster;
    return entry;
  });

  const upstreamUrl = page.meta?.upstreamUrl;
  if (
    ctx.source === "cosmos" &&
    upstreamUrl &&
    !media.some((m) => m.type === "video")
  ) {
    const entry: CaptureMedia = { url: upstreamUrl, type: "video" };
    if (media[0]?.url) entry.posterUrl = media[0].url;
    media.push(entry);
  }
  return media;
}

function authorFromPage(
  author: string | undefined,
  meta: PageMeta,
): CaptureAuthor | undefined {
  const handle = author
    ? author.replace(/^u\//, "").replace(/^@/, "")
    : undefined;
  const next: CaptureAuthor = {};
  if (meta.authorName !== undefined) next.name = meta.authorName;
  if (handle) next.handle = handle;
  if (meta.authorAvatar !== undefined) next.avatarUrl = meta.authorAvatar;
  if (meta.authorUrl !== undefined) next.profileUrl = meta.authorUrl;
  if (meta.verified === true) next.verified = true;
  if (
    !next.name &&
    author &&
    !author.startsWith("@") &&
    !author.startsWith("u/")
  ) {
    next.name = author;
    delete next.handle;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function metricsFromMeta(meta: PageMeta): CaptureMetrics | undefined {
  const out: CaptureMetrics = {};
  for (const key of METRIC_KEYS) {
    const v = meta.metrics?.[key] ?? meta[key];
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extrasFromMeta(meta: PageMeta): CaptureExtras | undefined {
  const extras: CaptureExtras = {};
  if (meta.subreddit !== undefined) extras.subreddit = meta.subreddit;
  if (meta.tileType !== undefined) extras.tileType = meta.tileType;
  if (meta.clusters) extras.clusters = meta.clusters;
  if (meta.publisher !== undefined) extras.publisher = meta.publisher;
  if (meta.faviconUrl !== undefined) extras.faviconUrl = meta.faviconUrl;
  if (meta.blockClass !== undefined) extras.blockClass = meta.blockClass;
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function upstreamFromMeta(meta: PageMeta): CaptureUpstream | undefined {
  const url = meta.upstreamUrl;
  if (!url) return undefined;
  try {
    return { url, host: new URL(url).host };
  } catch {
    return undefined;
  }
}
