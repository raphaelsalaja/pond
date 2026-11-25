/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { BrowserValidators } from "../lib/browser-validation";

export interface InstagramMediaVersion {
  url?: string;
  width?: number;
  height?: number;
}

export interface InstagramImageVersions {
  candidates?: Array<InstagramMediaVersion>;
}

export interface InstagramUser {
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
}

export interface InstagramMediaNode {
  pk?: string | number;
  code?: string;
  media_type?: number;
  taken_at?: number;
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  video_duration?: number;
  is_paid_partnership?: boolean;
  accessibility_caption?: string;
  location?: { name?: string };
  caption?: { text?: string } | string | null;
  user?: InstagramUser;
  owner?: InstagramUser;
  image_versions2?: InstagramImageVersions;
  video_versions?: Array<InstagramMediaVersion>;
  carousel_media?: Array<InstagramMediaNode>;
}

export interface InstagramMedia {
  url: string;
  type: MediaType;
  poster?: string;
  altText?: string;
  durationSec?: number;
}

export interface InstagramMeta {
  authorUrl?: string;
  authorName?: string;
  authorAvatar?: string;
  verified?: boolean;
  publishedAt?: string;
  lang?: string;
  metrics?: { likes?: number; comments?: number; plays?: number };
  isPaidPartnership?: boolean;
  location?: string;
  accessibilityCaption?: string;
  videoDurationSec?: number;
}

export interface InstagramPost {
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<InstagramMedia>;
  mediaType?: MediaType;
  meta?: InstagramMeta;
}

export interface InstagramEntry extends InstagramPost {
  sourceId: string;
  url: string;
  savedAt?: string;
}

export function inPageInstagramNormalize(validators: BrowserValidators) {
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function pkToShortcode(pk: string): string | null {
    try {
      const raw = pk.split("_")[0] ?? pk;
      let n = BigInt(raw);
      let s = "";
      while (n > 0n) {
        s = ALPHABET[Number(n & 63n)] + s;
        n = n >> 6n;
      }
      return s || null;
    } catch {
      return null;
    }
  }

  function shortcodeToPk(code: string): string {
    let n = 0n;
    for (const ch of code) {
      n = n * 64n + BigInt(ALPHABET.indexOf(ch));
    }
    return n.toString();
  }

  function pickBestImage(
    iv2: InstagramImageVersions | undefined,
  ): string | null {
    if (!iv2) return null;
    const cands = iv2.candidates || [];
    let best: { url: string; w: number } | null = null;
    for (const c of cands) {
      if (c?.url === undefined) continue;
      const w = Number(c.width) || 0;
      if (!best || w > best.w) best = { url: c.url, w };
    }
    return best?.url ?? null;
  }

  function pickBestVideo(
    versions: Array<InstagramMediaVersion> | undefined,
  ): string | null {
    if (!Array.isArray(versions)) return null;
    for (const v of versions) {
      if (v?.url !== undefined) return v.url;
    }
    return null;
  }

  function normalizeMediaNode(
    node: InstagramMediaNode,
    opts?: { savedTimestamp?: number },
  ): InstagramEntry | null {
    node = validators.instagramNode.parse(node);
    const pk = node.pk !== undefined ? String(node.pk) : null;
    const code = node.code ?? (pk ? pkToShortcode(pk) : null);
    if (!code) return null;

    const kind = node.media_type === 2 ? "reel" : "p";
    const out: InstagramEntry = {
      sourceId: code,
      url: `https://www.instagram.com/${kind}/${code}/`,
    };

    if (opts?.savedTimestamp !== undefined && opts.savedTimestamp !== null) {
      out.savedAt = new Date(opts.savedTimestamp * 1000).toISOString();
    }

    const meta: InstagramMeta = {};

    const user = node.user ?? node.owner;
    if (user?.username) {
      out.author = `@${user.username}`;
      meta.authorUrl = `https://www.instagram.com/${user.username}/`;
      if (user.full_name) meta.authorName = user.full_name;
      if (user.profile_pic_url) meta.authorAvatar = user.profile_pic_url;
      if (user.is_verified !== undefined) meta.verified = user.is_verified;
    }

    if (node.taken_at !== undefined) {
      meta.publishedAt = new Date(node.taken_at * 1000).toISOString();
    }

    const htmlLang = globalThis.document?.documentElement.lang?.trim() ?? null;
    if (htmlLang) meta.lang = htmlLang;

    const metrics: NonNullable<InstagramMeta["metrics"]> = {};
    if (node.like_count !== undefined) metrics.likes = node.like_count;
    if (node.comment_count !== undefined) metrics.comments = node.comment_count;
    if (node.play_count !== undefined) metrics.plays = node.play_count;
    if (Object.keys(metrics).length > 0) meta.metrics = metrics;

    if (node.is_paid_partnership !== undefined) {
      meta.isPaidPartnership = node.is_paid_partnership;
    }
    if (node.location?.name) {
      meta.location = node.location.name;
    }
    if (node.accessibility_caption !== undefined) {
      meta.accessibilityCaption = node.accessibility_caption;
    }
    if (node.video_duration !== undefined) {
      meta.videoDurationSec = Math.round(node.video_duration);
    }

    const text = validators.text.safeParse(node.caption).data ?? null;
    if (text) {
      out.description = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
      const firstLine = text.split(/\n+/)[0]?.trim() ?? text;
      out.title =
        firstLine.length <= 90
          ? firstLine
          : `${firstLine.slice(0, 89).trimEnd()}…`;
    }

    const media: Array<InstagramMedia> = [];
    const seen = new Set<string>();
    const push = (
      url: string | null,
      type: MediaType,
      extra?: Omit<InstagramMedia, "url" | "type">,
    ) => {
      if (!url || /^blob:/i.test(url) || seen.has(url)) return;
      seen.add(url);
      media.push({ url, type, ...extra });
    };

    if (node.media_type === 8 && Array.isArray(node.carousel_media)) {
      for (const child of node.carousel_media) {
        const altText = child.accessibility_caption;
        const dur =
          child.video_duration !== undefined
            ? Math.round(child.video_duration)
            : undefined;
        if (child.media_type === 2) {
          const v = pickBestVideo(child.video_versions);
          const img = pickBestImage(child.image_versions2);
          const extra: Omit<InstagramMedia, "url" | "type"> = {};
          if (img) extra.poster = img;
          if (altText) extra.altText = altText;
          if (dur) extra.durationSec = dur;
          push(v || img, "video", extra);
        } else {
          const img = pickBestImage(child.image_versions2);
          push(img, "image", altText ? { altText } : {});
        }
      }
    } else if (node.media_type === 2) {
      const v = pickBestVideo(node.video_versions);
      const img = pickBestImage(node.image_versions2);
      push(v || img, "video", img ? { poster: img } : {});
    } else {
      const img = pickBestImage(node.image_versions2);
      push(img, "image");
    }

    const first = media[0];
    if (first) {
      out.mediaUrls = media;
      out.mediaUrl = first.url;
      out.mediaType = first.type;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return {
    pickBestImage,
    pickBestVideo,
    pkToShortcode,
    shortcodeToPk,
    normalizeMediaNode,
  };
}
