import { isJsonValue } from "@pond/schema/json";
import type { JsonObject, JsonValue } from "@pond/schema/json";
import log from "electron-log/main.js";
import { z } from "zod";
import { isThreadsLandingMedia } from "./normalize";

const savedEnvelope = z.object({
  data: z.record(z.string(), z.unknown()),
});

let envelopeFailureLogged = false;

export interface SavedCapture {
  url: string;
  body: string;
  status?: number;
}

interface RichThreadMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

interface RichThreadMetrics {
  likes: number;
  retweets: number;
  replies: number;
  quotes?: number;
}

interface RichThreadCard {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  large?: boolean;
}

interface RichThreadAuthor {
  handle: string;
  name: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface RichThread {
  postId: string;
  url: string;
  fullText: string;
  author: RichThreadAuthor;
  media: Array<RichThreadMedia>;
  metrics: RichThreadMetrics;
  quoted?: RichThread;
  card?: RichThreadCard;
  isReply?: boolean;
  replyingTo?: string;
  publishedAt?: string;
  raw: unknown;
}

const OptionalText = z.string().min(1).optional().catch(undefined);
const OptionalCount = z
  .number()
  .refine(Number.isFinite)
  .optional()
  .catch(undefined);

const JsonObjectSchema = z.custom<JsonObject>(
  (value) => Object(value) === value && !Array.isArray(value),
);

const MediaVersionSchema = z
  .object({
    url: OptionalText,
    width: OptionalCount,
    height: OptionalCount,
  })
  .catch({});

type MediaVersion = z.infer<typeof MediaVersionSchema>;

const ImageVersionsSchema = z
  .object({
    candidates: z.array(MediaVersionSchema).optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

type ImageVersions = z.infer<typeof ImageVersionsSchema>;

const UserSchema = z
  .object({
    username: OptionalText,
    full_name: OptionalText,
    profile_pic_url: OptionalText,
    is_verified: z.boolean().optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

const CaptionTextSchema = z
  .union([
    z.object({ text: OptionalText }).transform((caption) => caption.text),
    z.string().min(1),
  ])
  .optional()
  .catch(undefined);

const LinkPreviewSchema = z
  .object({
    url: OptionalText,
    display_url: OptionalText,
    title: OptionalText,
    description: OptionalText,
    image_url: OptionalText,
    image: z
      .object({ url: OptionalText, uri: OptionalText })
      .optional()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);

const QuotedWrapperSchema = z
  .object({
    code: z.string().optional().catch(undefined),
    user: z.unknown().optional(),
    owner: z.unknown().optional(),
    post: JsonObjectSchema.optional().catch(undefined),
    media: JsonObjectSchema.optional().catch(undefined),
  })
  .catch({});

const QuotedPostSchema = z.preprocess((raw) => {
  const wrapper = QuotedWrapperSchema.parse(raw);
  return wrapper.code !== undefined || wrapper.user || wrapper.owner
    ? raw
    : (wrapper.post ?? wrapper.media);
}, JsonObjectSchema.optional().catch(undefined));

const TextPostAppInfoSchema = z.object({
  direct_reply_count: OptionalCount,
  quote_count: OptionalCount,
  repost_count: OptionalCount,
  is_reply: z.boolean().optional().catch(undefined),
  reply_to_author: z
    .object({ username: OptionalText })
    .optional()
    .catch(undefined),
  share_info: z
    .object({ quoted_post: QuotedPostSchema })
    .optional()
    .catch(undefined),
  link_preview_attachment: LinkPreviewSchema,
  link_preview_response: LinkPreviewSchema,
});

type ThreadPostInfo = z.infer<typeof TextPostAppInfoSchema>;

const MediaNodeSchema = z.object({
  media_type: OptionalCount,
  video_duration: OptionalCount,
  original_width: OptionalCount,
  original_height: OptionalCount,
  image_versions2: ImageVersionsSchema,
  video_versions: z.array(MediaVersionSchema).optional().catch(undefined),
});

type MediaNode = z.infer<typeof MediaNodeSchema>;

const ThreadPostSchema = MediaNodeSchema.extend({
  code: OptionalText,
  taken_at: OptionalCount,
  like_count: OptionalCount,
  comment_count: OptionalCount,
  caption: CaptionTextSchema,
  user: UserSchema,
  owner: UserSchema,
  carousel_media: z
    .array(MediaNodeSchema.catch({}))
    .optional()
    .catch(undefined),
  text_post_app_info: TextPostAppInfoSchema.optional().catch(undefined),
});

type ThreadPost = z.infer<typeof ThreadPostSchema>;

export function parseSavedResponses(
  captures: Array<SavedCapture>,
): Map<string, RichThread> {
  const out = new Map<string, RichThread>();
  for (const cap of captures) {
    let json: JsonValue;
    try {
      json = parseGraphqlBody(cap.body);
    } catch (error) {
      log.warn("[pond threads-saved] capture body not JSON", cap.url, error);
      continue;
    }
    if (json === null) {
      log.warn("[pond threads-saved] capture body not JSON", cap.url);
      continue;
    }
    const env = savedEnvelope.safeParse(json);
    if (!env.success && !envelopeFailureLogged) {
      envelopeFailureLogged = true;
      log.warn(
        "[pond threads-saved] envelope schema drift",
        cap.url,
        env.error.issues.map((i) => i.path.join(".")).join(", "),
      );
    }
    for (const node of collectThreadPosts(json)) {
      const thread = richThreadFromNode(node);
      if (thread) out.set(thread.postId, thread);
    }
  }
  return out;
}

function parseGraphqlBody(body: string): JsonValue {
  let s = body.trim();
  if (s.startsWith("for (;;);")) s = s.slice("for (;;);".length).trim();
  if (s.startsWith(")]}'")) {
    const nl = s.indexOf("\n");
    s = (nl === -1 ? s.replace(/^\)\]\}'/, "") : s.slice(nl + 1)).trim();
  }
  const parsed: unknown = JSON.parse(s);
  return isJsonValue(parsed) ? parsed : null;
}

/** Walks a GraphQL payload for post nodes; skips quoted/reposted children and carousel items, which carry their own `code`, so they stay nested on the parent. */
function collectThreadPosts(json: JsonValue): Array<JsonObject> {
  const out: Array<JsonObject> = [];
  const seen = new Set<string>();
  walk(json, false, (node) => {
    const code = OptionalText.parse(node.code);
    if (!code || seen.has(code)) return;
    if (
      !node.text_post_app_info &&
      !node.user &&
      !node.owner &&
      !node.caption &&
      !node.image_versions2
    ) {
      return;
    }
    seen.add(code);
    out.push(node);
  });
  return out;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Object(value) === value && !Array.isArray(value);
}

function walk(
  value: JsonValue,
  skipCollect: boolean,
  visit: (node: JsonObject) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, skipCollect, visit);
    return;
  }
  if (!isJsonObject(value)) return;
  if (!skipCollect) visit(value);
  for (const [key, child] of Object.entries(value)) {
    const nestedSkip =
      skipCollect ||
      key === "share_info" ||
      key === "quoted_post" ||
      key === "reposted_post" ||
      key === "carousel_media";
    walk(child, nestedSkip, visit);
  }
}

export function richThreadFromNode(raw: JsonObject): RichThread | null {
  const node = ThreadPostSchema.parse(raw);
  const postId = node.code;
  if (!postId) return null;

  const user = node.user ?? node.owner;
  const handle = user?.username ?? "";
  const url = handle
    ? `https://www.threads.com/@${handle}/post/${postId}`
    : `https://www.threads.com/t/${postId}`;

  const info = node.text_post_app_info;
  const media = collectNodeMedia(node);
  const quotedNode = info?.share_info?.quoted_post;
  const quoted =
    quotedNode && OptionalText.parse(quotedNode.code) !== postId
      ? (richThreadFromNode(quotedNode) ?? undefined)
      : undefined;
  const card = pickCard(info);

  const author: RichThreadAuthor = { handle, name: user?.full_name ?? handle };
  if (user?.profile_pic_url) author.avatarUrl = user.profile_pic_url;
  if (user?.is_verified === true) author.verified = true;

  const metrics: RichThreadMetrics = {
    likes: node.like_count ?? 0,
    retweets: info?.repost_count ?? 0,
    replies: info?.direct_reply_count ?? node.comment_count ?? 0,
  };
  if (info?.quote_count !== undefined) {
    metrics.quotes = info.quote_count;
  }

  const thread: RichThread = {
    postId,
    url,
    fullText: node.caption ?? "",
    author,
    media,
    metrics,
    raw,
  };
  if (quoted) thread.quoted = quoted;
  if (card) thread.card = card;
  if (info?.is_reply === true) thread.isReply = true;
  if (info?.reply_to_author?.username) {
    thread.replyingTo = info.reply_to_author.username;
  }
  if (node.taken_at !== undefined) {
    thread.publishedAt = new Date(node.taken_at * 1000).toISOString();
  }
  return thread;
}

function collectNodeMedia(node: ThreadPost): Array<RichThreadMedia> {
  const media: Array<RichThreadMedia> = [];
  const seen = new Set<string>();
  const push = (entry: RichThreadMedia | null) => {
    if (!entry || seen.has(entry.url) || isThreadsLandingMedia(entry.url)) {
      return;
    }
    seen.add(entry.url);
    media.push(entry);
  };

  const carousel = node.carousel_media;
  if (node.media_type === 8 && carousel) {
    for (const child of carousel) {
      push(mediaFromVersions(child));
    }
    return media;
  }
  push(mediaFromVersions(node));
  return media;
}

function mediaFromVersions(node: MediaNode): RichThreadMedia | null {
  const img = pickBestImage(node.image_versions2);
  const video = pickBestVideo(node.video_versions);
  const width = node.original_width ?? img?.width ?? video?.width;
  const height = node.original_height ?? img?.height ?? video?.height;
  const dur = node.video_duration;
  if (node.media_type === 2 || video) {
    const src = video ?? img;
    if (!src) return null;
    const entry: RichThreadMedia = { url: src.url, type: "video" };
    if (img) {
      entry.poster = img.url;
    }
    if (width) {
      entry.width = width;
    }
    if (height) {
      entry.height = height;
    }
    if (dur !== undefined) {
      entry.durationSec = Math.round(dur);
    }
    return entry;
  }
  if (!img) return null;
  const entry: RichThreadMedia = { url: img.url, type: "image" };
  if (width) entry.width = width;
  if (height) entry.height = height;
  return entry;
}

interface PickedImage {
  url: string;
  width: number;
  height?: number;
}

interface PickedVideo {
  url: string;
  width?: number;
  height?: number;
}

function pickBestImage(iv2: ImageVersions): PickedImage | null {
  if (!iv2) return null;
  const cands = iv2.candidates ?? [];
  let best: PickedImage | null = null;
  for (const c of cands) {
    const url = c.url;
    if (!url) continue;
    const w = c.width ?? 0;
    const h = c.height;
    if (!best || w > best.width) {
      best = { url, width: w };
      if (h) best.height = h;
    }
  }
  return best;
}

function pickBestVideo(
  versions: Array<MediaVersion> | undefined,
): PickedVideo | null {
  if (!versions) return null;
  for (const v of versions) {
    const url = v.url;
    if (!url) continue;
    const picked: PickedVideo = { url };
    if (v.width) picked.width = v.width;
    if (v.height) picked.height = v.height;
    return picked;
  }
  return null;
}

function pickCard(
  info: ThreadPostInfo | undefined,
): RichThreadCard | undefined {
  const att = info?.link_preview_attachment ?? info?.link_preview_response;
  if (!att) return undefined;
  const url = att.url ?? att.display_url;
  const title = att.title;
  const description = att.description;
  const image = att.image;
  const imageUrl = att.image_url ?? image?.url ?? image?.uri;
  if (!url && !title && !imageUrl) return undefined;
  let domain = att.display_url;
  if (url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /** Keep display_url when the href isn't absolute. */
    }
  }
  if (domain) domain = domain.replace(/^www\./, "").split("/")[0];
  const card: RichThreadCard = {};
  if (url) card.url = url;
  if (domain) card.domain = domain;
  if (title) card.title = title;
  if (description) card.description = description;
  if (imageUrl) card.imageUrl = imageUrl;
  return card;
}
