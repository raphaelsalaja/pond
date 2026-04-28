/// <reference lib="dom" />
import type { ScrapedHarvest } from "./types";

/**
 * In-page Twitter / X harvester. Runs *inside* the hidden BrowserWindow
 * (or a visible one when the user is connecting an account) — so the
 * full source is serialised as a string and `executeJavaScript`'d. It
 * has no access to anything outside `window` / `document`.
 *
 * Returns a `ScrapedHarvest` shaped like an `IngestPayload` minus the
 * fields the desktop main process supplies (`source`, `sourceId`,
 * `url`). Walks the same DOM the extension's passive listener does, so
 * the fields it produces line up 1:1 with what `tweet-card` already
 * knows how to render.
 *
 * Keep this self-contained: no imports, no helpers from outside the
 * `main()` function. The bundler is going to inline `harvestSource`
 * verbatim into a string passed to `webContents.executeJavaScript`.
 */
export function harvestSource(): string {
  // The function below is converted to a string and eval'd in-page.
  // Do not reference `globalThis` from outside via closure.
  function inPage(tweetId: string): unknown {
    function pickLargestSrcset(srcset: string): string | undefined {
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

    function upgradeTwimgUrl(url: string): string {
      try {
        const u = new URL(url);
        if (u.hostname === "pbs.twimg.com") {
          u.searchParams.set("name", "orig");
          return u.toString();
        }
      } catch {
        /* fall through */
      }
      return url;
    }

    const anchor = document.querySelector<HTMLAnchorElement>(
      `a[href*="/status/${tweetId}"]`,
    );
    const article = anchor?.closest("article") ?? null;
    if (!article) return null;

    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    /**
     * Twitter renders quote tweets / replies as nested `<article>` elements
     * inside the focused tweet's article. Anything we read needs to be
     * scoped to *direct* descendants of the focused article only — otherwise
     * we end up pulling photos out of a quoted tweet, or picking up the
     * reply text as the main body.
     */
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
      // Title: first line of the tweet, capped tight enough that the card
      // shows a real headline rather than a wrapped block of body text.
      // We deliberately don't reuse the same string in both fields — the
      // card / preview pane render them stacked, so duplicates look bad.
      const firstLine = text.split(/\n+/)[0]?.trim() ?? text;
      const titleCap = 90;
      out.title =
        firstLine.length <= titleCap
          ? firstLine
          : `${firstLine.slice(0, titleCap - 1).trimEnd()}…`;
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
        if (handle) out.author = `@${handle}`;
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

    const media: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const push = (m: Record<string, unknown> | undefined) => {
      const u = m && typeof m.url === "string" ? m.url : undefined;
      if (!u || seen.has(u)) return;
      seen.add(u);
      media.push(m as Record<string, unknown>);
    };

    // Video posters. Twitter's video player markup varies a lot between
    // device classes / promoted-tweet experiments, so we look in three
    // places and accept whichever lands first:
    //   1. The `<video>` element's `poster` attribute (when set).
    //   2. Any `<img>` rendered inside the `videoPlayer` /
    //      `videoComponent` wrappers — Twitter shows a still-frame
    //      `<img>` next to the `<video>` while the stream warms up,
    //      and on some experiments the still-frame is the *only*
    //      thing rendered until the user clicks play.
    //   3. As a last-ditch fallback, the page's `<meta property=
    //      "og:image">` — Twitter SSRs the poster URL there even when
    //      the live DOM hasn't hydrated yet, so video-only tweets
    //      that render past our explicit-wait deadline still produce
    //      a thumbnail instead of an empty card.
    const videos = Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    ).filter(notInNested);
    let capturedVideoPoster = false;
    for (const v of videos) {
      if (v.poster) {
        push({ url: v.poster, type: "video", poster: v.poster });
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
        const best = img.srcset ? pickLargestSrcset(img.srcset) : undefined;
        const src = best ?? img.currentSrc ?? img.src;
        if (src) {
          const upgraded = upgradeTwimgUrl(src);
          push({ url: upgraded, type: "video", poster: upgraded });
          capturedVideoPoster = true;
        }
      }
    }

    // Limit to images explicitly tagged as the focused tweet's photos.
    // The previous broader selector also caught quoted-tweet thumbnails
    // and link-card preview images, which surfaced as bogus extra
    // carousel slides in the preview pane.
    const photoImgs = Array.from(
      article.querySelectorAll<HTMLImageElement>(
        '[data-testid="tweetPhoto"] img',
      ),
    ).filter(notInNested);
    for (const img of photoImgs) {
      const best = img.srcset ? pickLargestSrcset(img.srcset) : undefined;
      const src = best ?? img.currentSrc ?? img.src;
      if (src) push({ url: upgradeTwimgUrl(src), type: "image" });
    }

    // Fallback: pull the poster off the page's meta tags. Twitter's
    // SSR includes `og:image` for the focused tweet even when the
    // video player markup hasn't rendered yet, so this rescues
    // video-only tweets where the article hydrates without any
    // <video> or videoPlayer image. We only consult it if nothing
    // above produced anything — otherwise we'd risk overlaying a
    // generic page preview onto a real photo carousel.
    if (media.length === 0) {
      const ogMeta = document.querySelector<HTMLMetaElement>(
        'meta[property="og:image"], meta[name="og:image"]',
      );
      const ogSrc = ogMeta?.content?.trim();
      if (ogSrc) {
        const upgraded = upgradeTwimgUrl(ogSrc);
        // Treat as a video poster when we know there was a <video>
        // in the article; otherwise label as image so the renderer's
        // carousel doesn't try to play a still as a video.
        const type = videos.length > 0 ? "video" : "image";
        push(
          type === "video"
            ? { url: upgraded, type, poster: upgraded }
            : { url: upgraded, type },
        );
      }
    }

    if (media.length > 0) {
      out.mediaUrls = media;
      out.mediaUrl = (media[0] as Record<string, unknown>).url;
      out.mediaType = (media[0] as Record<string, unknown>).type ?? "image";
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  return inPage.toString();
}

/**
 * Map the in-page result onto the canonical harvest shape. Exists so
 * the dispatcher in `harvest/index.ts` doesn't need to know each
 * source's quirks.
 */
export function adapt(raw: unknown): ScrapedHarvest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    author: typeof o.author === "string" ? o.author : undefined,
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

/** Pull the `<id>` out of `https://x.com/<handle>/status/<id>` etc. */
export function sourceIdFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\/status\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Wait for the tweet article to render, then call `harvestSource`. The
 * desktop calls this expression directly; the wait is needed because
 * Twitter's bundle takes a beat to hydrate after `did-finish-load`.
 */
export function buildExpression(tweetId: string): string {
  const fnSrc = harvestSource();
  return `(async () => {
    const fn = ${fnSrc};
    const tweetId = ${JSON.stringify(tweetId)};
    // Stage 1: wait for the focused tweet's article to mount. Without
    // this we'd be querying an empty document.
    const articleDeadline = Date.now() + 12_000;
    let article = null;
    while (Date.now() < articleDeadline) {
      const a = document.querySelector('a[href*="/status/' + tweetId + '"]');
      const candidate = a && a.closest('article');
      if (candidate) { article = candidate; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    // Stage 2: once the article exists, give the media subtree a chance
    // to hydrate before we read it. Twitter mounts <article> first and
    // streams in <video> / videoComponent / tweetPhoto images a tick or
    // two later, so harvesting at first paint reliably misses the
    // poster on video-only tweets. We bail as soon as *any* media-shape
    // node appears, with a tight cap so text-only tweets don't pay the
    // full timeout.
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
    try { return fn(tweetId); } catch (e) { return null; }
  })()`;
}
