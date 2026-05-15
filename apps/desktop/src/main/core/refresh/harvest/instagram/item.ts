/// <reference lib="dom" />

import type { ScrapedHarvest } from "../types";
import { inPageInstagramNormalize } from "./normalize";

export function buildExpression(shortcode: string): string {
  const normSrc = `(${inPageInstagramNormalize.toString()})()`;
  const fnSrc = `(${inPageInstagramHarvest.toString()})`;
  return `(async () => {
    const norm = ${normSrc};
    const sc = ${JSON.stringify(shortcode)};
    try { return await ${fnSrc}(sc, norm); } catch (e) { return null; }
  })()`;
}

async function inPageInstagramHarvest(
  sc: string,
  norm: ReturnType<typeof inPageInstagramNormalize>,
): Promise<unknown> {
  const pk = norm.shortcodeToPk(sc);
  let node: any = null;
  try {
    const res = await fetch(`/api/v1/media/${pk}/info/`, {
      method: "GET",
      credentials: "include",
      headers: {
        "x-ig-app-id": "936619743392459",
        "x-asbd-id": "129477",
        "x-requested-with": "XMLHttpRequest",
        accept: "*/*",
      },
    });
    if (res.ok) {
      const json = await res.json();
      const items = json?.items ?? [];
      node = items[0] ?? null;
    }
  } catch {
    /* fall through to DOM scrape */
  }

  if (node) return norm.normalizeMediaNode(node);

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const a = document.querySelector("article");
    if (a?.querySelector("img, video")) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return scrapeDom(sc);

  function scrapeDom(shortcode: string) {
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
      const firstLine = caption.split(/\n+/)[0]?.trim() ?? caption;
      out.title =
        firstLine.length <= 90
          ? firstLine
          : `${firstLine.slice(0, 89).trimEnd()}…`;
    }

    const time = article.querySelector<HTMLTimeElement>("time[datetime]");
    if (time?.dateTime) meta.publishedAt = time.dateTime;
    const htmlLang = document.documentElement.lang?.trim();
    if (htmlLang) meta.lang = htmlLang;
    if (typeof out.author === "string") {
      const handle = (out.author as string).replace(/^@/, "");
      if (handle) meta.authorUrl = `https://www.instagram.com/${handle}/`;
    }

    const media: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const push = (entry: Record<string, unknown> | undefined) => {
      const url = entry && typeof entry.url === "string" ? entry.url : null;
      if (!url || /^blob:/i.test(url) || seen.has(url)) return;
      seen.add(url);
      media.push(entry as Record<string, unknown>);
    };

    for (const v of Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    )) {
      if (v.poster) push({ url: v.poster, type: "video", poster: v.poster });
    }
    for (const img of Array.from(
      article.querySelectorAll<HTMLImageElement>("img"),
    )) {
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

    if (
      !out.author &&
      !out.title &&
      !out.mediaUrl &&
      !location.pathname.includes(shortcode)
    ) {
      return null;
    }
    return out;
  }
}

export function adapt(raw: unknown): ScrapedHarvest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const metaObj =
    o.meta && typeof o.meta === "object"
      ? (o.meta as Record<string, unknown>)
      : undefined;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    author: typeof o.author === "string" ? o.author : undefined,
    lang:
      typeof metaObj?.lang === "string" ? (metaObj.lang as string) : undefined,
    mediaUrl: typeof o.mediaUrl === "string" ? o.mediaUrl : undefined,
    mediaUrls: Array.isArray(o.mediaUrls)
      ? (o.mediaUrls as ScrapedHarvest["mediaUrls"])
      : undefined,
    mediaType:
      typeof o.mediaType === "string"
        ? (o.mediaType as ScrapedHarvest["mediaType"])
        : undefined,
    meta: metaObj,
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
