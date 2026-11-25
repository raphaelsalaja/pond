/// <reference lib="dom" />

import { z } from "zod";

/** Threads' static brand OG (the black logo tile) lives on rsrc.php, never on post CDN paths. */
export function isThreadsLandingMedia(url: string): boolean {
  return /static\.cdninstagram\.com\/rsrc\.php\//i.test(url);
}

export function isThreadsLandingCopy(text: string): boolean {
  const t = text.trim();
  return (
    /^Join Threads to share ideas/i.test(t) || /^Threads\s*•\s*Log in$/i.test(t)
  );
}

const StoredLandingRowSchema = z
  .object({
    capture: z
      .object({
        title: z.string().optional().catch(undefined),
        description: z.string().optional().catch(undefined),
        media: z
          .array(
            z.object({ url: z.string().optional().catch(undefined) }).catch({}),
          )
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export function isLandingOgThreadsSave(row: {
  source: string;
  title?: string | null;
  description?: string | null;
  rawJson?: unknown;
}): boolean {
  if (row.source !== "threads") return false;
  if (row.title && isThreadsLandingCopy(row.title)) return true;
  if (row.description && isThreadsLandingCopy(row.description)) return true;
  const capture = StoredLandingRowSchema.parse(row.rawJson).capture;
  if (!capture) return false;
  if (capture.title !== undefined && isThreadsLandingCopy(capture.title)) {
    return true;
  }
  if (
    capture.description !== undefined &&
    isThreadsLandingCopy(capture.description)
  ) {
    return true;
  }
  for (const m of capture.media ?? []) {
    if (m.url !== undefined && isThreadsLandingMedia(m.url)) return true;
  }
  return false;
}

interface ThreadsMediaVersion {
  url?: string;
  width?: number;
  height?: number;
}

interface ThreadsImageVersions {
  candidates?: Array<ThreadsMediaVersion>;
}

interface PickedVersion {
  url: string;
  width?: number;
  height?: number;
}

interface ThreadsUser {
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
}

interface ThreadsCaption {
  text?: string;
}

interface ThreadsLinkPreview {
  url?: string;
  display_url?: string;
  title?: string;
  description?: string;
  image_url?: string;
  image?: { url?: string; uri?: string };
  image_versions2?: { url?: string; uri?: string };
}

interface ThreadsQuotedPost extends ThreadsMediaNode {
  post?: ThreadsMediaNode;
  media?: ThreadsMediaNode;
}

interface ThreadsPostInfo {
  direct_reply_count?: number;
  quote_count?: number;
  repost_count?: number;
  is_reply?: boolean;
  reply_to_author?: { username?: string };
  share_info?: {
    quoted_post?: ThreadsQuotedPost;
    reposted_post?: ThreadsQuotedPost;
  };
  link_preview_attachment?: ThreadsLinkPreview;
  link_preview_response?: ThreadsLinkPreview;
}

export interface ThreadsMediaNode {
  pk?: string | number;
  code?: string;
  media_type?: number;
  taken_at?: number;
  like_count?: number;
  comment_count?: number;
  video_duration?: number;
  original_width?: number;
  original_height?: number;
  accessibility_caption?: string;
  caption?: ThreadsCaption | string | null;
  user?: ThreadsUser;
  owner?: ThreadsUser;
  image_versions2?: ThreadsImageVersions;
  video_versions?: Array<ThreadsMediaVersion>;
  carousel_media?: Array<ThreadsMediaNode>;
  text_post_app_info?: ThreadsPostInfo;
}

export interface HarvestedMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  altText?: string;
  durationSec?: number;
  width?: number;
  height?: number;
}

interface HarvestedMetrics {
  likes?: number;
  replies?: number;
  retweets?: number;
  quotes?: number;
}

interface HarvestedQuote {
  tweetId?: string;
  url?: string;
  author?: string;
  authorName?: string;
  authorAvatar?: string;
  text?: string;
  media?: Array<HarvestedMedia>;
}

interface HarvestedCard {
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

export interface HarvestedMeta {
  authorUrl?: string;
  authorName?: string;
  authorAvatar?: string;
  verified?: boolean;
  publishedAt?: string;
  lang?: string;
  metrics?: HarvestedMetrics;
  media?: Array<HarvestedMedia>;
  quotedTweet?: HarvestedQuote;
  card?: HarvestedCard;
  isReply?: boolean;
  replyingTo?: string;
}

export interface HarvestedPost {
  author?: string;
  title?: string;
  description?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<HarvestedMedia>;
  mediaType?: "image" | "video";
  meta?: HarvestedMeta;
}

export function inPageThreadsNormalize() {
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function shortcodeToPk(code: string): string {
    let n = 0n;
    for (const ch of code) {
      n = n * 64n + BigInt(ALPHABET.indexOf(ch));
    }
    return n.toString();
  }

  function pickLargestSrcset(srcset: string | null): string | undefined {
    if (!srcset) return undefined;
    const parts = srcset
      .split(",")
      .map((p) => p.trim())
      .map((p) => {
        const [u, sz] = p.split(/\s+/);
        return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
      })
      .filter((p) => p.u);
    if (!parts.length) return undefined;
    parts.sort((a, b) => b.w - a.w);
    return parts[0]?.u;
  }

  function looksLikeAvatar(url: string, alt?: string): boolean {
    if (alt && /profile picture/i.test(alt)) return true;
    if (/\/t51\.\d+-19\//.test(url)) return true;
    if (/profile_pic/i.test(url)) return true;
    return false;
  }

  function isBrandAsset(url: string): boolean {
    return /static\.cdninstagram\.com\/rsrc\.php\//i.test(url);
  }

  function pickBestImage(
    iv2: ThreadsImageVersions | null,
  ): PickedVersion | null {
    if (!iv2) return null;
    const cands = iv2.candidates || [];
    let best: { url: string; width: number; height?: number } | null = null;
    for (const c of cands) {
      if (!c?.url) continue;
      const w = Number(c.width) || 0;
      const h = Number(c.height) || 0;
      if (!best || w > best.width) {
        best = { url: c.url, width: w };
        if (h) best.height = h;
      }
    }
    if (!best) return null;
    const picked: PickedVersion = { url: best.url };
    if (best.width) picked.width = best.width;
    if (best.height) picked.height = best.height;
    return picked;
  }

  function pickBestVideo(
    versions: Array<ThreadsMediaVersion> | null,
  ): PickedVersion | null {
    if (!Array.isArray(versions)) return null;
    for (const v of versions) {
      if (!v?.url) continue;
      const w = Number(v.width) || 0;
      const h = Number(v.height) || 0;
      const picked: PickedVersion = { url: v.url };
      if (w) picked.width = w;
      if (h) picked.height = h;
      return picked;
    }
    return null;
  }

  function titleFromText(text: string): string {
    const firstLine = text.split(/\n+/)[0]?.trim() ?? text;
    return firstLine.length <= 90
      ? firstLine
      : `${firstLine.slice(0, 89).trimEnd()}…`;
  }

  function applyCaption(out: HarvestedPost, text: string): void {
    out.description = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
    out.title = titleFromText(text);
  }

  function count(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  }

  function isCaptionObject(
    caption: ThreadsCaption | string,
  ): caption is ThreadsCaption {
    return Object(caption) === caption;
  }

  function captionText(
    caption: ThreadsCaption | string | null | undefined,
  ): string | undefined {
    if (!caption) {
      return undefined;
    }
    return (isCaptionObject(caption) ? caption.text : caption) || undefined;
  }

  function collectNodeMedia(node: ThreadsMediaNode): Array<HarvestedMedia> {
    const media: Array<HarvestedMedia> = [];
    const seen = new Set<string>();
    const push = (entry: HarvestedMedia | null) => {
      const url = entry?.url;
      if (!entry || !url || /^blob:/i.test(url) || isBrandAsset(url)) return;
      if (seen.has(url)) return;
      seen.add(url);
      media.push(entry);
    };

    const applyDims = (
      entry: HarvestedMedia,
      img: PickedVersion | null,
      nodeW?: number,
      nodeH?: number,
    ): void => {
      const width = nodeW || img?.width;
      const height = nodeH || img?.height;
      if (width) entry.width = width;
      if (height) entry.height = height;
    };

    if (node.media_type === 8 && Array.isArray(node.carousel_media)) {
      for (const child of node.carousel_media) {
        const altText = child.accessibility_caption;
        const dur = Math.round(count(child.video_duration) ?? 0);
        if (child.media_type === 2) {
          const v = pickBestVideo(child.video_versions ?? null);
          const img = pickBestImage(child.image_versions2 ?? null);
          const src = v ?? img;
          if (!src) continue;
          const entry: HarvestedMedia = { url: src.url, type: "video" };
          if (img) entry.poster = img.url;
          if (altText) entry.altText = altText;
          if (dur) entry.durationSec = dur;
          applyDims(
            entry,
            v ?? img,
            child.original_width,
            child.original_height,
          );
          push(entry);
        } else {
          const img = pickBestImage(child.image_versions2 ?? null);
          if (!img) continue;
          const entry: HarvestedMedia = { url: img.url, type: "image" };
          if (altText) entry.altText = altText;
          applyDims(entry, img, child.original_width, child.original_height);
          push(entry);
        }
      }
    } else if (node.media_type === 2) {
      const v = pickBestVideo(node.video_versions ?? null);
      const img = pickBestImage(node.image_versions2 ?? null);
      const src = v ?? img;
      if (src) {
        const dur = Math.round(count(node.video_duration) ?? 0);
        const entry: HarvestedMedia = { url: src.url, type: "video" };
        if (img) entry.poster = img.url;
        if (dur) entry.durationSec = dur;
        applyDims(entry, v ?? img, node.original_width, node.original_height);
        push(entry);
      }
    } else {
      const img = pickBestImage(node.image_versions2 ?? null);
      if (img) {
        const altText = node.accessibility_caption;
        const entry: HarvestedMedia = { url: img.url, type: "image" };
        if (altText) entry.altText = altText;
        applyDims(entry, img, node.original_width, node.original_height);
        push(entry);
      }
    }
    return media;
  }

  function unwrapQuotedPost(
    raw: ThreadsQuotedPost | null | undefined,
  ): ThreadsMediaNode | null {
    if (!raw) return null;
    if (raw.code !== undefined || raw.user || raw.owner) return raw;
    return raw.post ?? raw.media ?? null;
  }

  function quotedFromShare(
    info: ThreadsPostInfo | null | undefined,
    parentCode: string,
  ): HarvestedQuote | null {
    const share = info?.share_info;
    if (!share) return null;
    const quotedNode = unwrapQuotedPost(share.quoted_post);
    if (!quotedNode) return null;
    const code = quotedNode.code;
    if (code && code === parentCode) return null;

    const user = quotedNode.user ?? quotedNode.owner;
    const handle = user?.username;
    const text = captionText(quotedNode.caption);
    const media = collectNodeMedia(quotedNode);
    if (!handle && !text && media.length === 0) return null;

    const quoted: HarvestedQuote = {};
    if (code) quoted.tweetId = code;
    if (handle && code) {
      quoted.url = `https://www.threads.com/@${handle}/post/${code}`;
    } else if (code) {
      quoted.url = `https://www.threads.com/t/${code}`;
    }
    if (handle) quoted.author = `@${handle}`;
    if (user?.full_name) quoted.authorName = user.full_name;
    if (user?.profile_pic_url) quoted.authorAvatar = user.profile_pic_url;
    if (text) quoted.text = text;
    if (media.length > 0) quoted.media = media;
    return quoted;
  }

  function cardFromPreview(
    info: ThreadsPostInfo | null | undefined,
  ): HarvestedCard | null {
    const att = info?.link_preview_attachment ?? info?.link_preview_response;
    if (!att) return null;
    const url = att.url || att.display_url;
    const title = att.title;
    const description = att.description;
    const image = att.image ?? att.image_versions2;
    const imageUrl = att.image_url || image?.url || image?.uri;
    if (!url && !title && !imageUrl) return null;
    let domain: string | undefined = att.display_url;
    if (url) {
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /** An unparseable link keeps the display URL as its domain. */
      }
    }
    if (domain) domain = domain.replace(/^www\./, "").split("/")[0];
    const card: HarvestedCard = {};
    if (url) card.url = url;
    if (domain) card.domain = domain;
    if (title) card.title = title;
    if (description) card.description = description;
    if (imageUrl) card.imageUrl = imageUrl;
    return card;
  }

  function normalizeMediaNode(node: ThreadsMediaNode): HarvestedPost | null {
    const code = node.code;
    if (!code) return null;

    const user = node.user ?? node.owner;
    const handle = user?.username;
    const out: HarvestedPost = {};
    const meta: HarvestedMeta = {};

    if (handle) {
      out.author = `@${handle}`;
      meta.authorUrl = `https://www.threads.com/@${handle}`;
      if (user?.full_name) meta.authorName = user.full_name;
      if (user?.profile_pic_url) meta.authorAvatar = user.profile_pic_url;
      if (user?.is_verified !== undefined) {
        meta.verified = user.is_verified;
      }
    }

    const takenAt = count(node.taken_at);
    if (takenAt !== undefined) {
      meta.publishedAt = new Date(takenAt * 1000).toISOString();
    }

    const htmlLang =
      "document" in globalThis ? document.documentElement.lang?.trim() : null;
    if (htmlLang) {
      out.lang = htmlLang;
      meta.lang = htmlLang;
    }

    const info = node.text_post_app_info;
    const metrics: HarvestedMetrics = {};
    const likes = count(node.like_count);
    if (likes !== undefined) metrics.likes = likes;
    const replies =
      count(info?.direct_reply_count) ?? count(node.comment_count);
    if (replies !== undefined) metrics.replies = replies;
    const reposts = count(info?.repost_count);
    if (reposts !== undefined) metrics.retweets = reposts;
    const quotes = count(info?.quote_count);
    if (quotes !== undefined) metrics.quotes = quotes;
    if (Object.keys(metrics).length > 0) meta.metrics = metrics;

    const text = captionText(node.caption);
    if (text) applyCaption(out, text);

    const media = collectNodeMedia(node);
    const first = media[0];
    if (first) {
      out.mediaUrls = media;
      out.mediaUrl = first.url;
      out.mediaType = first.type;
      meta.media = media;
    }

    const quoted = quotedFromShare(info, code);
    if (quoted) meta.quotedTweet = quoted;
    const card = cardFromPreview(info);
    if (card) meta.card = card;
    if (info?.is_reply === true) {
      meta.isReply = true;
      const replyHandle = info.reply_to_author?.username;
      if (replyHandle) meta.replyingTo = replyHandle;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  function extractPostCode(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl, location.origin);
      return (
        u.pathname.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ??
        u.pathname.match(/\/t\/([A-Za-z0-9_-]+)/)?.[1] ??
        null
      );
    } catch {
      return null;
    }
  }

  return {
    shortcodeToPk,
    pickLargestSrcset,
    looksLikeAvatar,
    isBrandAsset,
    applyCaption,
    titleFromText,
    normalizeMediaNode,
    extractPostCode,
  };
}
