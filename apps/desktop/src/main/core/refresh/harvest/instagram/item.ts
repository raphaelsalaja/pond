/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageInstagramNormalize } from "./normalize";
import type {
  InstagramMedia,
  InstagramMediaNode,
  InstagramMeta,
  InstagramPost,
} from "./normalize";

export function buildExpression(shortcode: string): string {
  return buildItemExpression(
    inPageInstagramNormalize,
    inPageInstagramHarvest,
    shortcode,
  );
}

async function inPageInstagramHarvest(
  sc: string,
  norm: ReturnType<typeof inPageInstagramNormalize>,
): Promise<InstagramPost | null> {
  const isMediaReply = (
    value: unknown,
  ): value is { items?: Array<InstagramMediaNode> } => Object(value) === value;
  const pk = norm.shortcodeToPk(sc);
  let node: InstagramMediaNode | null = null;
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
      const json: unknown = await res.json();
      node = isMediaReply(json) ? (json.items?.[0] ?? null) : null;
    }
  } catch {
    /** A failed API read falls through to the DOM scrape below. */
  }

  if (node) {
    return norm.normalizeMediaNode(node);
  }

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const a = document.querySelector("article");
    if (a?.querySelector("img, video")) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  return scrapeDom(sc);

  function scrapeDom(shortcode: string): InstagramPost | null {
    function pickLargestSrcset(srcset: string | null) {
      if (!srcset) {
        return null;
      }
      const parts = srcset
        .split(",")
        .map((p) => p.trim())
        .map((p) => {
          const [u, sz] = p.split(/\s+/);
          return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
        })
        .filter((p) => p.u);
      if (!parts.length) {
        return null;
      }
      parts.sort((a, b) => b.w - a.w);
      return parts[0]?.u ?? null;
    }

    function looksLikeAvatar(url: string | null) {
      if (!url) {
        return true;
      }
      if (/\/t51\.82787-19\//.test(url)) {
        return true;
      }
      if (/profile_pic/i.test(url)) {
        return true;
      }
      return false;
    }

    const article = document.querySelector("article");
    if (!article) {
      return null;
    }

    const out: InstagramPost = {};
    const meta: InstagramMeta = {};

    const handleAnchor = Array.from(
      article.querySelectorAll<HTMLAnchorElement>("a[href^='/']"),
    ).find((a) => /^\/[A-Za-z0-9._]+\/?$/.test(a.getAttribute("href") ?? ""));
    if (handleAnchor) {
      const handle = (handleAnchor.getAttribute("href") ?? "").replaceAll(
        "/",
        "",
      );
      if (handle) {
        out.author = `@${handle}`;
      }
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
    if (time?.dateTime) {
      meta.publishedAt = time.dateTime;
    }
    const htmlLang = document.documentElement.lang?.trim();
    if (htmlLang) {
      meta.lang = htmlLang;
    }
    if (out.author) {
      const handle = out.author.replace(/^@/, "");
      if (handle) {
        meta.authorUrl = `https://www.instagram.com/${handle}/`;
      }
    }

    const media: Array<InstagramMedia> = [];
    const seen = new Set<string>();
    const push = (entry: InstagramMedia) => {
      const url = entry.url;
      if (!url || /^blob:/i.test(url) || seen.has(url)) {
        return;
      }
      seen.add(url);
      media.push(entry);
    };

    for (const v of Array.from(
      article.querySelectorAll<HTMLVideoElement>("video"),
    )) {
      if (v.poster) {
        push({ url: v.poster, type: "video", poster: v.poster });
      }
    }
    let avatarUrl: string | null = null;
    for (const img of Array.from(
      article.querySelectorAll<HTMLImageElement>("img"),
    )) {
      const best = pickLargestSrcset(img.srcset) ?? img.currentSrc ?? img.src;
      if (!best) {
        continue;
      }
      if (looksLikeAvatar(best)) {
        if (!avatarUrl) {
          avatarUrl = best;
        }
        continue;
      }
      push({ url: best, type: "image" });
    }
    if (avatarUrl) {
      meta.authorAvatar = avatarUrl;
    }

    const first = media[0];
    if (first) {
      out.mediaUrls = media;
      out.mediaUrl = first.url;
      out.mediaType = first.type;
    }

    if (Object.keys(meta).length > 0) {
      out.meta = meta;
    }

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

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
