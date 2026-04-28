/// <reference lib="dom" />
import type { ScrapedHarvest } from "./types";

/**
 * In-page Instagram harvester for the *permalink* view (i.e. when we
 * navigate the hidden window straight to `instagram.com/p/<shortcode>`
 * instead of riding along with a user click in the feed).
 *
 * The full extension scraper listens to GraphQL responses; we can't
 * replay that here, so we settle for what's visible in the DOM after
 * the post hydrates: cover image / video poster, caption, author handle,
 * and -- when present -- the carousel slides surfaced via the
 * post's own `<img srcset>` / `<video>` elements.
 */
export function buildExpression(shortcode: string): string {
  function inPage(sc: string): unknown {
    function pickLargestSrcset(srcset: string | null) {
      if (!srcset) return null;
      const parts = srcset
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          const [u, sz] = p.split(/\s+/);
          return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
        })
        .filter((p) => p.u);
      if (!parts.length) return null;
      parts.sort((a, b) => b.w - a.w);
      return parts[0]?.u ?? null;
    }

    function looksLikeAvatar(url: string | null) {
      if (!url) return true;
      if (/\/t51\.82787-19\//.test(url)) return true;
      if (/profile_pic/i.test(url)) return true;
      return false;
    }

    const article = document.querySelector("article");
    if (!article) return null;

    const out: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    const handleAnchor = Array.from(
      article.querySelectorAll<HTMLAnchorElement>("a[href^='/']"),
    ).find((a) => /^\/[A-Za-z0-9._]+\/?$/.test(a.getAttribute("href") ?? ""));
    if (handleAnchor) {
      const handle = (handleAnchor.getAttribute("href") ?? "").replace(
        /\//g,
        "",
      );
      if (handle) out.author = `@${handle}`;
    }

    const captionH1 = article.querySelector("h1");
    const caption = captionH1?.textContent?.trim();
    if (caption) {
      out.description =
        caption.length > 4000 ? `${caption.slice(0, 4000)}…` : caption;
      // Headline-style title: first line, tightly capped, with ellipsis
      // on overflow. Avoids the "title and description show the same
      // text" duplication you'd get from `caption.slice(0, 200)`.
      const firstLine = caption.split(/\n+/)[0]?.trim() ?? caption;
      const titleCap = 90;
      out.title =
        firstLine.length <= titleCap
          ? firstLine
          : `${firstLine.slice(0, titleCap - 1).trimEnd()}…`;
    }

    const time = article.querySelector<HTMLTimeElement>("time[datetime]");
    if (time?.dateTime) meta.publishedAt = time.dateTime;

    const media: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const push = (entry: Record<string, unknown> | undefined) => {
      const url = entry && typeof entry.url === "string" ? entry.url : null;
      if (!url || /^blob:/i.test(url) || seen.has(url)) return;
      seen.add(url);
      media.push(entry as Record<string, unknown>);
    };

    const videos = Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    );
    for (const v of videos) {
      if (v.poster) push({ url: v.poster, type: "video", poster: v.poster });
    }

    const imgs = Array.from(article.querySelectorAll<HTMLImageElement>("img"));
    for (const img of imgs) {
      const best = pickLargestSrcset(img.srcset) ?? img.currentSrc ?? img.src;
      if (!best || looksLikeAvatar(best)) continue;
      push({ url: best, type: "image" });
    }

    if (media.length > 0) {
      out.mediaUrls = media;
      out.mediaUrl = (media[0] as Record<string, unknown>).url;
      out.mediaType = (media[0] as Record<string, unknown>).type ?? "image";
    }

    if (Object.keys(meta).length > 0) out.meta = meta;

    // The only thing we use `sc` for is sanity: bail if the URL drifted
    // (e.g. Instagram redirected us to login).
    if (
      !out.author &&
      !out.title &&
      !out.mediaUrl &&
      !location.pathname.includes(sc)
    ) {
      return null;
    }
    return out;
  }

  const fnSrc = inPage.toString();
  return `(async () => {
    const fn = ${fnSrc};
    const sc = ${JSON.stringify(shortcode)};
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const a = document.querySelector('article');
      if (a && a.querySelector('img, video')) break;
      await new Promise(r => setTimeout(r, 250));
    }
    try { return fn(sc); } catch (e) { return null; }
  })()`;
}

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

export function sourceIdFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
