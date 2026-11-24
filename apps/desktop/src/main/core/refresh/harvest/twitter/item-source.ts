/// <reference lib="dom" />

import type { inPageTwitterNormalize } from "./normalize";

interface TweetPageMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  altText?: string;
}

interface TweetPageQuoted {
  tweetId?: string;
  url?: string;
  author?: string;
  authorName?: string;
  authorAvatar?: string;
  text?: string;
  media?: Array<TweetPageMedia>;
}

interface TweetPageCard {
  url?: string;
  large?: boolean;
  imageUrl?: string;
  domain?: string;
  title?: string;
  description?: string;
}

interface TweetPageMetrics {
  replies?: number;
  retweets?: number;
  likes?: number;
  views?: number;
  bookmarks?: number;
  quotes?: number;
}

interface TweetPageMeta {
  lang?: string;
  authorUrl?: string;
  authorName?: string;
  authorAvatar?: string;
  verified?: boolean;
  publishedAt?: string;
  isReply?: boolean;
  replyingTo?: string;
  replyTo?: TweetPageQuoted;
  isQuote?: boolean;
  isThreadRoot?: boolean;
  conversationId?: string;
  quotedTweet?: TweetPageQuoted;
  metrics?: TweetPageMetrics;
  media?: Array<TweetPageMedia>;
  card?: TweetPageCard;
}

interface TweetPage {
  title?: string;
  description?: string;
  author?: string;
  lang?: string;
  mediaUrl?: string;
  mediaUrls?: Array<TweetPageMedia>;
  mediaType?: "image" | "video";
  meta?: TweetPageMeta;
}

export function harvestSource(): string {
  function inPage(
    tweetId: string,
    norm: ReturnType<typeof inPageTwitterNormalize>,
  ): TweetPage | null {
    const anchor = document.querySelector<HTMLAnchorElement>(
      `a[href*="/status/${tweetId}"]`,
    );
    const article = anchor?.closest("article") ?? null;
    if (!article) {
      return null;
    }

    const out: TweetPage = {};
    const meta: TweetPageMeta = {};
    const mediaItems: Array<TweetPageMedia> = [];

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
        const handle = new URL(handleLink.href).pathname.replaceAll("/", "");
        if (handle) {
          out.author = `@${handle}`;
          meta.authorUrl = `https://x.com/${handle}`;
        }
      }

      const nameLink = handleLink;
      if (nameLink) {
        const raw = nameLink.textContent?.replaceAll(/\s+/g, " ").trim();
        if (raw) {
          meta.authorName = raw;
        }
      }

      meta.verified = !!userName.querySelector(
        'svg[data-testid="icon-verified"], svg[aria-label="Verified account"]',
      );

      const time = userName.querySelector<HTMLTimeElement>("time[datetime]");
      const dt = time?.getAttribute("datetime");
      if (dt) {
        meta.publishedAt = dt;
      }
    }

    if (!meta.publishedAt) {
      const time = Array.from(
        article.querySelectorAll<HTMLTimeElement>("time[datetime]"),
      ).find(notInNested);
      const dt = time?.getAttribute("datetime");
      if (dt) {
        meta.publishedAt = dt;
      }
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
    if (meta.isReply) {
      const currentPathId =
        window.location.pathname.match(/\/status\/(\d+)/)?.[1];
      const articles = Array.from(document.querySelectorAll("article")).filter(
        (candidate) => !candidate.parentElement?.closest("article"),
      );
      const currentIndex = articles.indexOf(article);
      let parentLink: HTMLAnchorElement | undefined;
      if (currentPathId === tweetId && currentIndex > 0) {
        const candidate = articles[currentIndex - 1];
        if (candidate) {
          parentLink = Array.from(
            candidate.querySelectorAll<HTMLAnchorElement>(
              'a[href*="/status/"]',
            ),
          ).find((link) => {
            if (link.closest("article") !== candidate) {
              return false;
            }
            const id = link.href.match(/\/status\/(\d+)/)?.[1];
            return !!id && id !== tweetId;
          });
        }
      }
      const parentId = parentLink?.href.match(/\/status\/(\d+)/)?.[1];
      if (parentLink && parentId) {
        let pathname: string;
        try {
          pathname = new URL(parentLink.href).pathname;
        } catch {
          pathname = `/i/status/${parentId}`;
        }
        const replyTo: TweetPageQuoted = {
          tweetId: parentId,
          url: `https://x.com${pathname}`,
        };
        const handle = pathname.match(/^\/([A-Za-z0-9_]+)\/status\//)?.[1];
        if (handle) {
          replyTo.author = `@${handle}`;
          meta.replyingTo = handle;
        }
        meta.replyTo = replyTo;
      }
      if (!meta.replyingTo) {
        const label = Array.from(article.querySelectorAll("a")).find((link) =>
          /Replying to/i.test(link.textContent ?? ""),
        );
        const handle = label?.textContent?.match(/@([A-Za-z0-9_]+)/)?.[1];
        if (handle) {
          meta.replyingTo = handle;
        }
      }
    }

    const innerArticle = Array.from(
      article.querySelectorAll<HTMLElement>("article"),
    ).find((a) => a !== article);
    if (innerArticle) {
      meta.isQuote = true;
      const quoted: TweetPageQuoted = {};
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
        const h = new URL(innerHandle.href).pathname.replaceAll("/", "");
        if (h) {
          quoted.author = `@${h}`;
          const innerName = innerHandle.textContent
            ?.replaceAll(/\s+/g, " ")
            .trim();
          if (innerName) {
            quoted.authorName = innerName;
          }
        }
      }
      const innerAvatar = innerArticle.querySelector<HTMLImageElement>(
        '[data-testid^="UserAvatar-Container"] img',
      );
      const innerAvatarSrc = innerAvatar?.currentSrc ?? innerAvatar?.src ?? "";
      if (innerAvatarSrc) {
        quoted.authorAvatar = innerAvatarSrc.replace(
          /_normal(\.(?:jpg|jpeg|png|webp))/i,
          "_400x400$1",
        );
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

    const metrics: TweetPageMetrics = {};
    const reply = norm.metricFromTestid(article, "reply");
    if (reply !== undefined) {
      metrics.replies = reply;
    }
    const rt = norm.metricFromTestid(article, "retweet");
    if (rt !== undefined) {
      metrics.retweets = rt;
    }
    const like = norm.metricFromTestid(article, "like");
    if (like !== undefined) {
      metrics.likes = like;
    }
    const views = norm.metricFromTestid(article, "viewCount");
    if (views !== undefined) {
      metrics.views = views;
    }
    let bookmarks = norm.metricFromTestid(article, "bookmark");
    if (bookmarks === undefined) {
      const candidates = Array.from(
        article.querySelectorAll<HTMLElement>("[aria-label]"),
      ).filter(notInNested);
      for (const el of candidates) {
        const lbl = el.getAttribute("aria-label") ?? "";
        if (!/bookmark/i.test(lbl)) {
          continue;
        }
        const match = lbl.match(/([\d.,]+\s*[KMB]?)\s+Bookmark/i);
        if (!match?.[1]) {
          continue;
        }
        const parsed = norm.parseMetric(match[1]);
        if (parsed !== undefined) {
          bookmarks = parsed;
          break;
        }
      }
    }
    if (bookmarks !== undefined) {
      metrics.bookmarks = bookmarks;
    }

    let quotes: number | undefined;
    {
      const quoteCandidates = Array.from(
        article.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/quotes"], a[href*="/retweets/with_comments"]',
        ),
      ).filter(notInNested);
      for (const el of quoteCandidates) {
        const lbl = el.getAttribute("aria-label") ?? el.textContent ?? "";
        const match = lbl.match(/([\d.,]+\s*[KMB]?)\s+Quote/i);
        if (!match?.[1]) {
          continue;
        }
        const parsed = norm.parseMetric(match[1]);
        if (parsed !== undefined) {
          quotes = parsed;
          break;
        }
      }
    }
    if (quotes !== undefined) {
      metrics.quotes = quotes;
    }
    if (Object.keys(metrics).length > 0) {
      meta.metrics = metrics;
    }

    const media: Array<TweetPageMedia> = [];
    const seen = new Set<string>();
    const push = (m: TweetPageMedia) => {
      if (!m.url || seen.has(m.url)) {
        return;
      }
      seen.add(m.url);
      media.push(m);
    };

    const videos = Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    ).filter(notInNested);
    let capturedVideoPoster = false;
    let videoDuration: number | undefined;
    let videoWidth: number | undefined;
    let videoHeight: number | undefined;
    for (const v of videos) {
      const dur = norm.readDuration(v);
      if (dur) {
        videoDuration = dur;
      }
      if (v.videoWidth) {
        videoWidth = v.videoWidth;
      }
      if (v.videoHeight) {
        videoHeight = v.videoHeight;
      }
      const poster = norm.httpMediaUrl(v.poster);
      if (!poster) {
        continue;
      }
      push({ url: poster, type: "video", poster });
      const item: TweetPageMedia = { url: poster, type: "video", poster };
      if (dur) {
        item.durationSec = dur;
      }
      if (v.videoWidth) {
        item.width = v.videoWidth;
      }
      if (v.videoHeight) {
        item.height = v.videoHeight;
      }
      mediaItems.push(item);
      capturedVideoPoster = true;
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
        const poster = norm.httpMediaUrl(best ?? img.currentSrc ?? img.src);
        if (!poster) {
          continue;
        }
        push({ url: poster, type: "video", poster });
        const item: TweetPageMedia = { url: poster, type: "video", poster };
        if (videoDuration) {
          item.durationSec = videoDuration;
        }
        if (videoWidth) {
          item.width = videoWidth;
        }
        if (videoHeight) {
          item.height = videoHeight;
        }
        mediaItems.push(item);
      }
    }

    const photoImgs = Array.from(
      article.querySelectorAll<HTMLImageElement>(
        '[data-testid="tweetPhoto"] img',
      ),
    ).filter(notInNested);
    for (const img of photoImgs) {
      const best = img.srcset ? norm.pickLargestSrcset(img.srcset) : undefined;
      const src = norm.httpMediaUrl(best ?? img.currentSrc ?? img.src);
      if (!src) {
        continue;
      }
      push({ url: src, type: "image" });
      const item: TweetPageMedia = { url: src, type: "image" };
      const alt = img.getAttribute("alt")?.trim();
      if (alt) {
        item.altText = alt;
      }
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w) {
        item.width = w;
      }
      if (h) {
        item.height = h;
      }
      mediaItems.push(item);
    }

    if (innerArticle) {
      const quotedMedia: Array<TweetPageMedia> = [];
      const pushQuoted = (m: TweetPageMedia) => {
        push(m);
        mediaItems.push(m);
        quotedMedia.push(m);
      };
      const quotedVideos = Array.from(
        innerArticle.querySelectorAll<HTMLVideoElement>("video"),
      );
      let capturedQuotedVideo = false;
      for (const v of quotedVideos) {
        const poster = norm.httpMediaUrl(v.poster);
        if (!poster) {
          continue;
        }
        const dur = norm.readDuration(v);
        const w = v.videoWidth;
        const h = v.videoHeight;
        const item: TweetPageMedia = { url: poster, type: "video", poster };
        if (dur) {
          item.durationSec = dur;
        }
        if (w) {
          item.width = w;
        }
        if (h) {
          item.height = h;
        }
        pushQuoted(item);
        capturedQuotedVideo = true;
      }
      if (!capturedQuotedVideo) {
        const quotedVideoPosters = Array.from(
          innerArticle.querySelectorAll<HTMLImageElement>(
            '[data-testid="videoPlayer"] img, [data-testid="videoComponent"] img',
          ),
        );
        for (const img of quotedVideoPosters) {
          const best = img.srcset
            ? norm.pickLargestSrcset(img.srcset)
            : undefined;
          const poster = norm.httpMediaUrl(best ?? img.currentSrc ?? img.src);
          if (!poster) {
            continue;
          }
          pushQuoted({ url: poster, type: "video", poster });
        }
      }

      const quotedPhotos = Array.from(
        innerArticle.querySelectorAll<HTMLImageElement>(
          '[data-testid="tweetPhoto"] img',
        ),
      );
      for (const img of quotedPhotos) {
        const best = img.srcset
          ? norm.pickLargestSrcset(img.srcset)
          : undefined;
        const src = norm.httpMediaUrl(best ?? img.currentSrc ?? img.src);
        if (!src) {
          continue;
        }
        const item: TweetPageMedia = { url: src, type: "image" };
        const alt = img.getAttribute("alt")?.trim();
        if (alt) {
          item.altText = alt;
        }
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w) {
          item.width = w;
        }
        if (h) {
          item.height = h;
        }
        pushQuoted(item);
      }

      if (quotedMedia.length > 0 && meta.quotedTweet) {
        meta.quotedTweet.media = quotedMedia;
      }
    }

    if (media.length === 0) {
      const ogMeta = document.querySelector<HTMLMetaElement>(
        'meta[property="og:image"], meta[name="og:image"]',
      );
      const ogSrc = ogMeta?.content?.trim();
      const isSsrDefault =
        ogSrc !== undefined &&
        /^https?:\/\/abs\.twimg\.com\/rweb\/ssr\/default\//i.test(ogSrc);
      const isAvatar = ogSrc !== undefined && /\/profile_images\//i.test(ogSrc);
      if (ogSrc && !isSsrDefault && !isAvatar) {
        const upgraded = norm.httpMediaUrl(ogSrc);
        if (upgraded) {
          const entry: TweetPageMedia =
            videos.length > 0
              ? { url: upgraded, type: "video", poster: upgraded }
              : { url: upgraded, type: "image" };
          push(entry);
          mediaItems.push(entry);
        }
      }
    }

    const first = media[0];
    if (first) {
      out.mediaUrls = media;
      out.mediaUrl = first.url;
      out.mediaType = first.type;
    }

    if (mediaItems.length > 0) {
      meta.media = mediaItems;
    }

    const cardWrap = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="card.wrapper"]'),
    ).find(notInNested);
    if (cardWrap) {
      const card: TweetPageCard = {};

      const linkEl = cardWrap.querySelector<HTMLAnchorElement>("a[href]");
      if (linkEl?.href) {
        card.url = linkEl.href;
      }

      card.large = !!cardWrap.querySelector(
        '[data-testid="card.layoutLarge.media"]',
      );

      const mediaBlock =
        cardWrap.querySelector<HTMLElement>('[data-testid$=".media"]') ??
        cardWrap;
      let cardImgSrc =
        mediaBlock.querySelector<HTMLImageElement>("img")?.currentSrc ??
        mediaBlock.querySelector<HTMLImageElement>("img")?.src ??
        "";
      if (!cardImgSrc) {
        const bgEl = Array.from(
          mediaBlock.querySelectorAll<HTMLElement>("*"),
        ).find((el) => {
          const bg = window.getComputedStyle(el).backgroundImage;
          return !!bg && bg !== "none" && bg.includes("url(");
        });
        if (bgEl) {
          const match = window
            .getComputedStyle(bgEl)
            .backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
          if (match?.[2]) {
            cardImgSrc = match[2];
          }
        }
      }
      if (cardImgSrc) {
        card.imageUrl = cardImgSrc;
      }

      /** The detail column stacks domain, title, description as separate spans; read each span's own text to avoid concatenating parent rows, then map by X's fixed ordering. */
      const detail =
        cardWrap.querySelector<HTMLElement>('[data-testid$=".detail"]') ??
        cardWrap;
      const directText = (el: Element): string => {
        let s = "";
        el.childNodes.forEach((n) => {
          if (n.nodeType === 3) {
            s += n.textContent ?? "";
          }
        });
        return s.replaceAll(/\s+/g, " ").trim();
      };
      const rows = Array.from(detail.querySelectorAll<HTMLElement>("span"))
        .map(directText)
        .filter((t) => t.length > 0);
      const unique = rows.filter((t, i) => rows.indexOf(t) === i);
      const [domain, title, description] = unique;
      if (domain) {
        card.domain = domain;
      }
      if (title) {
        card.title = title;
      }
      if (description) {
        card.description = description;
      }

      if (card.url || card.title || card.imageUrl) {
        meta.card = card;
      }
    }

    if (Object.keys(meta).length > 0) {
      out.meta = meta;
    }
    return out;
  }

  return inPage.toString();
}
