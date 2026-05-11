/// <reference lib="dom" />

/**
 * Twitter/X single-tweet collector. Runs inside the hidden
 * BrowserWindow via `executeJavaScript`. Injects the shared
 * normalizer for `upgradeTwimgUrl`, `parseMetric`, etc.
 */

import type { ScrapedHarvest } from "../types";
import { inPageTwitterNormalize } from "./normalize";

export function harvestSource(): string {
  function inPage(
    tweetId: string,
    norm: ReturnType<typeof inPageTwitterNormalize>,
  ): unknown {
    const anchor = document.querySelector<HTMLAnchorElement>(
      `a[href*="/status/${tweetId}"]`,
    );
    const article = anchor?.closest("article") ?? null;
    if (!article) return null;

    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};
    const mediaItems: Array<Record<string, unknown>> = [];

    function notInNested(el: Element): boolean {
      const closest = el.closest("article");
      return closest === article;
    }

    const textEl = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'),
    ).find(notInNested);
    const text = textEl?.textContent?.trim();
    if (text) {
      out.description = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
      const firstLine = text.split(/\n+/)[0]?.trim() ?? text;
      const titleCap = 90;
      out.title =
        firstLine.length <= titleCap
          ? firstLine
          : `${firstLine.slice(0, titleCap - 1).trimEnd()}…`;
    }

    const langAttr = textEl?.getAttribute("lang")?.trim();
    if (langAttr) {
      out.lang = langAttr;
      meta.lang = langAttr;
    }

    const userName = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="User-Name"]'),
    ).find(notInNested);
    if (userName) {
      const handleLink = Array.from(
        userName.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ).find((a) => {
        try {
          const p = new URL(a.href).pathname;
          return /^\/[A-Za-z0-9_]+\/?$/.test(p) && !p.startsWith("/i/");
        } catch {
          return false;
        }
      });
      if (handleLink) {
        const handle = new URL(handleLink.href).pathname.replace(/\//g, "");
        if (handle) {
          out.author = `@${handle}`;
          meta.authorUrl = `https://x.com/${handle}`;
        }
      }

      const nameLink = handleLink;
      if (nameLink) {
        const raw = nameLink.textContent?.replace(/\s+/g, " ").trim();
        if (raw) meta.authorName = raw;
      }

      meta.verified = !!userName.querySelector(
        'svg[data-testid="icon-verified"], svg[aria-label="Verified account"]',
      );

      const time = userName.querySelector<HTMLTimeElement>("time[datetime]");
      const dt = time?.getAttribute("datetime");
      if (dt) meta.publishedAt = dt;
    }

    const avatarImg = article.querySelector<HTMLImageElement>(
      '[data-testid^="UserAvatar-Container"] img',
    );
    const avatarSrc = avatarImg?.currentSrc ?? avatarImg?.src ?? "";
    if (avatarSrc) {
      meta.authorAvatar = avatarSrc.replace(
        /_normal(\.(?:jpg|jpeg|png|webp))/i,
        "_400x400$1",
      );
    }

    const replyingPrefix = Array.from(
      article.querySelectorAll<HTMLElement>("a[href^='/']"),
    ).some((a) => /Replying to/i.test(a.textContent ?? ""));
    meta.isReply = !!(
      replyingPrefix || article.querySelector('[data-testid="reply-context"]')
    );

    const innerArticle = Array.from(
      article.querySelectorAll<HTMLElement>("article"),
    ).find((a) => a !== article);
    if (innerArticle) {
      meta.isQuote = true;
      const quoted: Record<string, unknown> = {};
      const innerLink = Array.from(
        innerArticle.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
      )[0];
      const innerTweetId = innerLink
        ? innerLink.href.match(/\/status\/(\d+)/)?.[1]
        : undefined;
      if (innerTweetId && innerLink) {
        quoted.tweetId = innerTweetId;
        quoted.url = `https://x.com${new URL(innerLink.href).pathname}`;
      }
      const innerHandle = Array.from(
        innerArticle.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ).find((a) => {
        try {
          const p = new URL(a.href).pathname;
          return /^\/[A-Za-z0-9_]+\/?$/.test(p) && !p.startsWith("/i/");
        } catch {
          return false;
        }
      });
      if (innerHandle) {
        const h = new URL(innerHandle.href).pathname.replace(/\//g, "");
        if (h) {
          quoted.author = `@${h}`;
          const innerName = innerHandle.textContent
            ?.replace(/\s+/g, " ")
            .trim();
          if (innerName) quoted.authorName = innerName;
        }
      }
      const innerText = innerArticle.querySelector<HTMLElement>(
        '[data-testid="tweetText"]',
      );
      const innerBody = innerText?.textContent?.trim();
      if (innerBody) {
        quoted.text =
          innerBody.length > 600 ? `${innerBody.slice(0, 600)}…` : innerBody;
      }
      meta.quotedTweet = quoted;
    } else {
      meta.isQuote = false;
    }

    meta.isThreadRoot = !!article.querySelector(
      'a[href*="/with_replies"], div[data-testid="reply"]',
    );
    if (!meta.isReply) {
      meta.conversationId = tweetId;
    }

    const metrics: Record<string, unknown> = {};
    const reply = norm.metricFromTestid(article, "reply");
    if (reply !== undefined) metrics.replies = reply;
    const rt = norm.metricFromTestid(article, "retweet");
    if (rt !== undefined) metrics.retweets = rt;
    const like = norm.metricFromTestid(article, "like");
    if (like !== undefined) metrics.likes = like;
    const views = norm.metricFromTestid(article, "viewCount");
    if (views !== undefined) metrics.views = views;
    let bookmarks = norm.metricFromTestid(article, "bookmark");
    if (bookmarks === undefined) {
      const candidates = Array.from(
        article.querySelectorAll<HTMLElement>("[aria-label]"),
      ).filter(notInNested);
      for (const el of candidates) {
        const lbl = el.getAttribute("aria-label") ?? "";
        if (!/bookmark/i.test(lbl)) continue;
        const match = lbl.match(/([\d.,]+\s*[KMB]?)\s+Bookmark/i);
        if (!match?.[1]) continue;
        const parsed = norm.parseMetric(match[1]);
        if (parsed !== undefined) {
          bookmarks = parsed;
          break;
        }
      }
    }
    if (bookmarks !== undefined) metrics.bookmarks = bookmarks;
    if (Object.keys(metrics).length > 0) meta.metrics = metrics;

    const media: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const push = (m: Record<string, unknown> | undefined) => {
      const u = m && typeof m.url === "string" ? m.url : undefined;
      if (!u || seen.has(u)) return;
      seen.add(u);
      media.push(m as Record<string, unknown>);
    };

    const videos = Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    ).filter(notInNested);
    let capturedVideoPoster = false;
    for (const v of videos) {
      if (v.poster) {
        push({ url: v.poster, type: "video", poster: v.poster });
        const dur = norm.readDuration(v);
        const w = v.videoWidth;
        const h = v.videoHeight;
        mediaItems.push({
          url: v.poster,
          type: "video",
          poster: v.poster,
          ...(dur ? { durationSec: dur } : {}),
          ...(w ? { width: w } : {}),
          ...(h ? { height: h } : {}),
        });
        capturedVideoPoster = true;
      }
    }
    if (!capturedVideoPoster) {
      const videoPosterImgs = Array.from(
        article.querySelectorAll<HTMLImageElement>(
          '[data-testid="videoPlayer"] img, [data-testid="videoComponent"] img',
        ),
      ).filter(notInNested);
      for (const img of videoPosterImgs) {
        const best = img.srcset
          ? norm.pickLargestSrcset(img.srcset)
          : undefined;
        const src = best ?? img.currentSrc ?? img.src;
        if (src) {
          const upgraded = norm.upgradeTwimgUrl(src);
          push({ url: upgraded, type: "video", poster: upgraded });
          mediaItems.push({
            url: upgraded,
            type: "video",
            poster: upgraded,
          });
          capturedVideoPoster = true;
        }
      }
    }

    const photoImgs = Array.from(
      article.querySelectorAll<HTMLImageElement>(
        '[data-testid="tweetPhoto"] img',
      ),
    ).filter(notInNested);
    for (const img of photoImgs) {
      const best = img.srcset ? norm.pickLargestSrcset(img.srcset) : undefined;
      const src = best ?? img.currentSrc ?? img.src;
      if (src) {
        const upgraded = norm.upgradeTwimgUrl(src);
        push({ url: upgraded, type: "image" });
        const item: Record<string, unknown> = {
          url: upgraded,
          type: "image",
        };
        const alt = img.getAttribute("alt")?.trim();
        if (alt) item.altText = alt;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w) item.width = w;
        if (h) item.height = h;
        mediaItems.push(item);
      }
    }

    if (media.length === 0) {
      const ogMeta = document.querySelector<HTMLMetaElement>(
        'meta[property="og:image"], meta[name="og:image"]',
      );
      const ogSrc = ogMeta?.content?.trim();
      if (ogSrc) {
        const upgraded = norm.upgradeTwimgUrl(ogSrc);
        const type = videos.length > 0 ? "video" : "image";
        const entry =
          type === "video"
            ? { url: upgraded, type, poster: upgraded }
            : { url: upgraded, type };
        push(entry);
        mediaItems.push(entry);
      }
    }

    if (media.length > 0) {
      out.mediaUrls = media;
      out.mediaUrl = (media[0] as Record<string, unknown>).url;
      out.mediaType = (media[0] as Record<string, unknown>).type ?? "image";
    }

    if (mediaItems.length > 0) meta.media = mediaItems;
    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return inPage.toString();
}

export function adapt(raw: unknown): ScrapedHarvest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    author: typeof o.author === "string" ? o.author : undefined,
    lang: typeof o.lang === "string" ? o.lang : undefined,
    mediaUrl: typeof o.mediaUrl === "string" ? o.mediaUrl : undefined,
    mediaUrls: Array.isArray(o.mediaUrls)
      ? (o.mediaUrls as ScrapedHarvest["mediaUrls"])
      : undefined,
    mediaType:
      typeof o.mediaType === "string"
        ? (o.mediaType as ScrapedHarvest["mediaType"])
        : undefined,
    meta:
      o.meta && typeof o.meta === "object"
        ? (o.meta as Record<string, unknown>)
        : undefined,
  };
}

export function sourceIdFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\/status\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildExpression(tweetId: string): string {
  const normSrc = `(${inPageTwitterNormalize.toString()})()`;
  const fnSrc = harvestSource();
  return `(async () => {
    const norm = ${normSrc};
    const fn = ${fnSrc};
    const tweetId = ${JSON.stringify(tweetId)};
    const articleDeadline = Date.now() + 12_000;
    let article = null;
    while (Date.now() < articleDeadline) {
      const a = document.querySelector('a[href*="/status/' + tweetId + '"]');
      const candidate = a && a.closest('article');
      if (candidate) { article = candidate; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    if (article) {
      const mediaDeadline = Date.now() + 5_000;
      while (Date.now() < mediaDeadline) {
        const hasMedia = !!article.querySelector(
          '[data-testid="tweetPhoto"] img, video, [data-testid="videoPlayer"] img, [data-testid="videoComponent"] img'
        );
        if (hasMedia) break;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    try { return fn(tweetId, norm); } catch (e) { return null; }
  })()`;
}
