/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";

interface RedditPostPageMedia {
  url: string;
  type: MediaType;
  poster?: string;
}

interface RedditPostPageMetrics {
  likes?: number;
  comments?: number;
}

interface RedditPostPageMeta {
  authorName?: string;
  authorUrl?: string;
  subreddit?: string;
  publishedAt?: string;
  metrics?: RedditPostPageMetrics;
  lang?: string;
}

export interface RedditPostPage {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: RedditPostPageMedia[];
  mediaType?: MediaType;
  meta?: RedditPostPageMeta;
}

export function inPageRedditNormalize() {
  const getMeta = (selectors: readonly string[]): string | undefined => {
    for (const sel of selectors) {
      const el = document.querySelector<HTMLMetaElement>(sel);
      const value = el?.content?.trim();
      if (value) return value;
    }
    return undefined;
  };

  function httpUrl(raw: string | null | undefined): string | undefined {
    if (!raw) return undefined;
    try {
      const href = new URL(raw, location.href).href;
      return /^https?:\/\//i.test(href) ? href : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The page harvest cannot import source descriptors. These are the same
   * YouTube, Vimeo, and TikTok item URLs the JSON capture already sends to yt-dlp.
   */
  function embeddedVideoUrl(
    raw: string | null | undefined,
  ): string | undefined {
    const href = httpUrl(raw);
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return undefined;
    }
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube.com")
    ) {
      const id =
        host === "youtu.be"
          ? url.pathname.split("/").filter(Boolean)[0]
          : (url.searchParams.get("v") ??
            /^\/(?:embed|live|shorts)\/([^/?#]+)/.exec(url.pathname)?.[1]);
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? href : undefined;
    }
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      return /\/\d{5,12}(?:[/?#]|$)/.test(url.pathname) ? href : undefined;
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      if (/\/video\/\d+/.test(url.pathname)) return href;
      if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return href;
    }
    return undefined;
  }

  function embedInPost(scope: Element): string | undefined {
    const own = embeddedVideoUrl(scope.getAttribute("content-href"));
    if (own) return own;
    for (const el of Array.from(
      scope.querySelectorAll("[content-href], iframe"),
    )) {
      const video =
        embeddedVideoUrl(el.getAttribute("content-href")) ||
        embeddedVideoUrl(el.getAttribute("src"));
      if (video) return video;
    }
    return undefined;
  }

  function videoPending(): boolean {
    const post = document.querySelector("shreddit-post");
    if (!post) return false;
    if (post.querySelector("shreddit-player[src]")) return false;
    if (
      getMeta([
        'meta[property="og:video"]',
        'meta[property="og:video:url"]',
        'meta[property="og:video:secure_url"]',
      ])
    ) {
      return false;
    }
    if (embeddedVideoUrl(post.getAttribute("content-href"))) return false;
    const kind = post.getAttribute("post-type");
    return (
      kind === "video" ||
      Boolean(post.querySelector("shreddit-player, [post-type='video']"))
    );
  }

  function extractPostMeta(): RedditPostPage | null {
    const out: RedditPostPage = {};
    const meta: RedditPostPageMeta = {};

    const post = document.querySelector("shreddit-post");

    const title =
      post?.getAttribute("post-title")?.trim() ||
      document.querySelector<HTMLElement>("h1")?.textContent?.trim() ||
      getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    if (title) {
      const cleaned = title.replace(/\s+:\s+r\/[A-Za-z0-9_]+\s*$/i, "").trim();
      out.title = cleaned || title;
    }

    const desc = getMeta([
      'meta[property="og:description"]',
      'meta[name="description"]',
    ]);
    if (desc) {
      out.description = desc.length > 4000 ? `${desc.slice(0, 4000)}…` : desc;
    }

    const authorAttr = post?.getAttribute("author")?.trim();
    const authorLink = document.querySelector<HTMLAnchorElement>(
      'a[href^="/user/"], a[href^="/u/"]',
    );
    const author =
      authorAttr ||
      authorLink?.textContent?.trim().replace(/^u\//, "") ||
      undefined;
    if (author) {
      out.author = author;
      meta.authorName = author;
      meta.authorUrl = `https://www.reddit.com/user/${author.replace(/^u\//, "")}`;
    }

    const subreddit =
      post?.getAttribute("subreddit-prefixed-name")?.trim() ||
      (() => {
        const m = location.pathname.match(/\/r\/([A-Za-z0-9_]+)/);
        return m ? `r/${m[1]}` : undefined;
      })();
    if (subreddit) meta.subreddit = subreddit;

    const created = post?.getAttribute("created-timestamp")?.trim();
    if (created) meta.publishedAt = created;

    const metrics: RedditPostPageMetrics = {};
    const score = post?.getAttribute("score");
    if (score && Number.isFinite(Number(score))) metrics.likes = Number(score);
    const comments = post?.getAttribute("comment-count");
    if (comments && Number.isFinite(Number(comments))) {
      metrics.comments = Number(comments);
    }
    if (Object.keys(metrics).length > 0) meta.metrics = metrics;

    const ogVideo = httpUrl(
      getMeta([
        'meta[property="og:video"]',
        'meta[property="og:video:url"]',
        'meta[property="og:video:secure_url"]',
      ]),
    );
    const ogImage = getMeta([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]);

    /**
     * `shreddit-player` is not an HTMLVideoElement, so its src used to be
     * ignored and the thumbnail won. A player outside this post is a promotion.
     * Third-party video is only `content-href` (or an embed iframe) plus that still.
     */
    const postId = post?.getAttribute("id") ?? "";
    const player = post?.querySelector("shreddit-player") ?? null;
    const playerId = player?.getAttribute("post-id") ?? "";
    const playerSrc = httpUrl(player?.getAttribute("src"));
    const ownPlayer =
      playerSrc && playerId && playerId === postId ? playerSrc : undefined;
    const htmlVideo = post?.querySelector("video") ?? null;
    const htmlSrc =
      htmlVideo instanceof HTMLVideoElement
        ? httpUrl(htmlVideo.getAttribute("src")) ||
          httpUrl(htmlVideo.querySelector("source")?.getAttribute("src"))
        : undefined;
    const kind = post?.getAttribute("post-type");
    const nestedPlayer =
      playerSrc && (kind === "crosspost" || kind === "video")
        ? playerSrc
        : undefined;
    const embed = post ? embedInPost(post) : undefined;
    const videoSrc = ownPlayer || htmlSrc || ogVideo || embed || nestedPlayer;
    if (videoSrc) {
      const poster =
        httpUrl(player?.getAttribute("poster")) ||
        (htmlVideo instanceof HTMLVideoElement
          ? httpUrl(htmlVideo.getAttribute("poster"))
          : undefined) ||
        ogImage ||
        undefined;
      out.mediaUrl = poster || videoSrc;
      const entry: RedditPostPageMedia = { url: videoSrc, type: "video" };
      if (poster) entry.poster = poster;
      out.mediaUrls = [entry];
      out.mediaType = "video";
    } else if (ogImage) {
      out.mediaUrl = ogImage;
      out.mediaUrls = [{ url: ogImage, type: "image" }];
      out.mediaType = "image";
    }

    const lang = document.documentElement.lang?.trim();
    if (lang) {
      out.lang = lang;
      meta.lang = lang;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    if (!out.title && !out.description && !out.mediaUrl) return null;
    return out;
  }

  function extractPostId(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl, location.origin);
      if (/(?:^|\.)redd\.it$/i.test(u.hostname)) {
        return u.pathname.replace(/^\//, "").split("/")[0] || null;
      }
      return (
        u.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1] ??
        u.pathname.match(/\/r\/[^/]+\/comments\/([a-z0-9]+)/i)?.[1] ??
        null
      );
    } catch {
      return null;
    }
  }

  return { extractPostMeta, extractPostId, videoPending };
}
