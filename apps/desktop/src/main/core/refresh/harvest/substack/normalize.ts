import type { Capture, CaptureArticle, CaptureAuthor } from "@pond/schema/raw";
import { z } from "zod";
import type { ListEntry } from "../list-types";

/** Long enough to read and search a post, short enough to keep the save row small. */
const TEXT_LIMIT = 20_000;

const BylineSchema = z
  .object({
    name: z.string().optional().catch(undefined),
    handle: z.string().optional().catch(undefined),
    photo_url: z.string().nullish().catch(undefined),
  })
  .catch({});

export const PostSchema = z.object({
  id: z.number(),
  slug: z.string().optional().catch(undefined),
  title: z.string().nullish().catch(undefined),
  subtitle: z.string().nullish().catch(undefined),
  description: z.string().nullish().catch(undefined),
  post_date: z.string().nullish().catch(undefined),
  canonical_url: z.string().nullish().catch(undefined),
  cover_image: z.string().nullish().catch(undefined),
  body_html: z.string().nullish().catch(undefined),
  audience: z.string().nullish().catch(undefined),
  wordcount: z.number().nullish().catch(undefined),
  truncated_body_text: z.string().nullish().catch(undefined),
  publication_id: z.number().nullish().catch(undefined),
  reaction_count: z.number().nullish().catch(undefined),
  comment_count: z.number().nullish().catch(undefined),
  publishedBylines: z.array(BylineSchema).optional().catch(undefined),
});
export type SubstackPost = z.infer<typeof PostSchema>;

export const PublicationSchema = z.object({
  id: z.number(),
  name: z.string().nullish().catch(undefined),
  subdomain: z.string().nullish().catch(undefined),
  custom_domain: z.string().nullish().catch(undefined),
  logo_url: z.string().nullish().catch(undefined),
});
export type SubstackPublication = z.infer<typeof PublicationSchema>;

const lenient = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema.nullable().catch(null)).optional().catch(undefined);

export const ReaderPageSchema = z.object({
  posts: lenient(PostSchema),
  publications: lenient(PublicationSchema),
  more: z.boolean().optional().catch(undefined),
  cursor: z.string().nullish().catch(undefined),
});

export const LikesPageSchema = z.object({
  items: lenient(
    z.object({
      type: z.string().optional().catch(undefined),
      context: z
        .object({ type: z.string().optional().catch(undefined) })
        .optional()
        .catch(undefined),
      post: PostSchema.nullish().catch(undefined),
      publication: PublicationSchema.nullish().catch(undefined),
    }),
  ),
  nextCursor: z.string().nullish().catch(undefined),
});

export const ProfileSchema = z.object({
  id: z.number(),
  handle: z.string().nullish().catch(undefined),
  subscriptions: lenient(
    z.object({ publication: PublicationSchema.nullish().catch(undefined) }),
  ),
});

export const PostByIdSchema = z.object({
  post: PostSchema,
  publication: PublicationSchema.nullish().catch(undefined),
});

/** A post on its publication's subdomain, which every Substack publication keeps even with its own domain. */
function substackPostUrl(
  post: Pick<SubstackPost, "id" | "slug">,
  publication: Pick<SubstackPublication, "subdomain"> | null | undefined,
): string {
  if (post.slug && publication?.subdomain) {
    return `https://${publication.subdomain.toLowerCase()}.substack.com/p/${post.slug}`;
  }
  return `https://substack.com/home/post/p-${post.id}`;
}

function substackPostId(
  post: Pick<SubstackPost, "id" | "slug">,
  publication: Pick<SubstackPublication, "subdomain"> | null | undefined,
): string {
  if (post.slug && publication?.subdomain) {
    return `${publication.subdomain.toLowerCase()}.substack.com/p/${post.slug}`;
  }
  return `p-${post.id}`;
}

export function postEntry(
  post: SubstackPost,
  publication: SubstackPublication | null | undefined,
  known: ReadonlySet<string>,
): ListEntry {
  /** A post first saved from a reader link keeps the id it was saved under, so sync doesn't add it twice. */
  const byId = `p-${post.id}`;
  const reader = known.has(byId);
  const entry: ListEntry = {
    sourceId: reader ? byId : substackPostId(post, publication),
    url: reader
      ? `https://substack.com/home/post/${byId}`
      : substackPostUrl(post, publication),
  };
  if (post.title) entry.title = post.title;
  const about = post.subtitle || post.description;
  if (about) entry.description = about;
  const author = post.publishedBylines?.[0]?.name;
  if (author) entry.author = author;
  if (post.cover_image) {
    entry.mediaUrl = post.cover_image;
    entry.mediaType = "image";
  }
  return entry;
}

export function captureFromPost(
  post: SubstackPost,
  publication: SubstackPublication | null | undefined,
  sourceId: string,
  url: string,
): Capture {
  const capture: Capture = {
    id: sourceId,
    source: "substack",
    url,
    media: post.cover_image ? [{ url: post.cover_image, type: "image" }] : [],
  };
  if (post.title) capture.title = post.title;
  const body = post.body_html
    ? htmlToText(post.body_html)
    : (post.truncated_body_text ?? "");
  const text = [post.subtitle?.trim(), body.trim()]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
  if (text) {
    capture.description =
      text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
  }
  const article = articleFromPost(post, body);
  if (article) capture.article = article;
  if (post.post_date) capture.publishedAt = post.post_date;
  const byline = post.publishedBylines?.[0];
  if (byline?.name || byline?.handle) {
    const author: CaptureAuthor = {};
    if (byline.name) author.name = byline.name;
    if (byline.handle) {
      author.handle = byline.handle;
      author.profileUrl = `https://substack.com/@${byline.handle}`;
    }
    if (byline.photo_url) author.avatarUrl = byline.photo_url;
    capture.author = author;
  }
  const metrics: NonNullable<Capture["metrics"]> = {};
  if (post.reaction_count !== undefined && post.reaction_count !== null) {
    metrics.likes = post.reaction_count;
  }
  if (post.comment_count !== undefined && post.comment_count !== null) {
    metrics.comments = post.comment_count;
  }
  if (Object.keys(metrics).length > 0) {
    capture.metrics = metrics;
  }
  if (publication?.name) {
    capture.extras = { publisher: publication.name };
  }
  return capture;
}

/** Under this share of the post's word count, a non-public body is Substack's paywall preview. */
const PREVIEW_RATIO = 0.8;

function articleFromPost(
  post: SubstackPost,
  bodyText: string,
): CaptureArticle | null {
  const html = post.body_html?.trim()
    ? post.body_html
    : post.truncated_body_text?.trim()
      ? `<p>${escapeHtml(post.truncated_body_text.trim())}</p>`
      : "";
  if (!html) return null;
  const article: CaptureArticle = { html };
  const subtitle = post.subtitle?.trim();
  if (subtitle) article.subtitle = subtitle;
  if (post.canonical_url) article.canonicalUrl = post.canonical_url;
  const words = bodyText.split(/\s+/).filter(Boolean).length;
  if (
    post.audience &&
    post.audience !== "everyone" &&
    (!post.body_html?.trim() ||
      (post.wordcount !== undefined &&
        post.wordcount !== null &&
        words < post.wordcount * PREVIEW_RATIO))
  ) {
    article.preview = true;
  }
  return article;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export interface FeedItem {
  url: string;
  sourceId: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  mediaUrl?: string;
}

/** Items of a publication's RSS feed, addressed on its subdomain so they match saved and synced posts. */
export function feedItems(xml: string, subdomain: string): Array<FeedItem> {
  const items: Array<FeedItem> = [];
  const host = `${subdomain.toLowerCase()}.substack.com`;
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const link = tagText(block, "link");
    const slug = link ? /\/p\/([A-Za-z0-9_-]+)/.exec(link)?.[1] : undefined;
    if (!slug) continue;
    const item: FeedItem = {
      url: `https://${host}/p/${slug}`,
      sourceId: `${host}/p/${slug}`,
    };
    const title = tagText(block, "title");
    if (title) item.title = title;
    const author = tagText(block, "dc:creator");
    if (author) item.author = author;
    const date = tagText(block, "pubDate");
    const published = date ? Date.parse(date) : Number.NaN;
    if (Number.isFinite(published)) {
      item.publishedAt = new Date(published).toISOString();
    }
    const enclosure = /<enclosure[^>]*url="([^"]+)"[^>]*type="image\//.exec(
      block,
    )?.[1];
    if (enclosure) item.mediaUrl = decodeEntities(enclosure);
    items.push(item);
  }
  return items;
}

function tagText(block: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  if (!match?.[1]) return undefined;
  const raw = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
  return raw ? decodeEntities(raw) : undefined;
}

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, code: string) => {
      if (code[0] === "#") {
        const point =
          code[1] === "x" || code[1] === "X"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
      }
      return NAMED_ENTITIES.get(code.toLowerCase()) ?? whole;
    },
  );
}

/** Post HTML as readable paragraphs; Substack bodies are flat blocks, so tags map straight to line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replaceAll(/<(script|style|figure|svg)[\s\S]*?<\/\1>/gi, "")
      .replaceAll(/<br\s*\/?>/gi, "\n")
      .replaceAll(/<li[^>]*>/gi, "\n- ")
      .replaceAll(/<\/(p|h[1-6]|blockquote|li|ul|ol|pre|div)>/gi, "\n\n")
      .replaceAll(/<[^>]+>/g, ""),
  )
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
