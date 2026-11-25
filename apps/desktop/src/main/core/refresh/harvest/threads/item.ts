/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { z } from "zod";
import {
  captureFromTweetDraft,
  draftFromDomHarvest,
} from "../../../capture/tweet-draft";
import { parsePageBlob } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import {
  inPageThreadsNormalize,
  isThreadsLandingCopy,
  isThreadsLandingMedia,
} from "./normalize";
import type {
  HarvestedMedia,
  HarvestedMeta,
  HarvestedPost,
  ThreadsMediaNode,
} from "./normalize";

export function buildExpression(code: string): string {
  return buildItemExpression(
    inPageThreadsNormalize,
    inPageThreadsHarvest,
    code,
  );
}

async function inPageThreadsHarvest(
  code: string,
  norm: ReturnType<typeof inPageThreadsNormalize>,
): Promise<HarvestedPost | null> {
  const isMediaReply = (
    value: unknown,
  ): value is { items?: Array<ThreadsMediaNode> } => Object(value) === value;
  const pk = norm.shortcodeToPk(code);
  try {
    const res = await fetch(`/api/v1/media/${pk}/info/`, {
      method: "GET",
      credentials: "include",
      headers: {
        "x-ig-app-id": "238260118697367",
        "x-asbd-id": "129477",
        "x-requested-with": "XMLHttpRequest",
        accept: "*/*",
      },
    });
    if (res.ok) {
      const json: unknown = await res.json();
      const node = isMediaReply(json) ? (json.items?.[0] ?? null) : null;
      if (node) {
        return norm.normalizeMediaNode(node);
      }
    }
  } catch {
    /** A failed API read falls through to the DOM scrape below. */
  }

  const articleDeadline = Date.now() + 12_000;
  let card: Element | null = null;
  while (Date.now() < articleDeadline) {
    const a = document.querySelector<HTMLAnchorElement>(
      `a[href*="/post/${code}"]`,
    );
    const candidate =
      a?.closest("[data-pressable-container], [role='article'], article") ??
      null;
    if (candidate) {
      card = candidate;
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  if (!card) return null;
  const root = card;

  const countMedia = () => root.querySelectorAll("picture img, video").length;
  const mediaDeadline = Date.now() + 8000;
  const stableMs = 800;
  let lastCount = 0;
  let stableSince = 0;
  while (Date.now() < mediaDeadline) {
    const count = countMedia();
    if (count > 0) {
      if (count === lastCount) {
        if (stableSince === 0) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) break;
      } else {
        lastCount = count;
        stableSince = 0;
      }
    }
    await new Promise((r) => {
      setTimeout(r, 200);
    });
  }

  return scrapeDom(root);

  function scrapeDom(root: Element): HarvestedPost | null {
    const out: HarvestedPost = {};
    const meta: HarvestedMeta = {};

    const handleLink = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'),
    ).find((a) => /^\/@[A-Za-z0-9._]+\/?$/.test(a.getAttribute("href") ?? ""));
    const handle = handleLink
      ?.getAttribute("href")
      ?.match(/^\/@([A-Za-z0-9._]+)/)?.[1];
    if (handle) {
      out.author = `@${handle}`;
      meta.authorUrl = `https://www.threads.com/@${handle}`;
    }

    const texts = Array.from(root.querySelectorAll<HTMLElement>("[dir='auto']"))
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => {
        if (!t) return false;
        if (handle && t.replace(/^@/, "") === handle) return false;
        if (/^Translate$/i.test(t)) return false;
        if (/^\d+[smhd]$/i.test(t)) return false;
        if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(t)) return false;
        return true;
      });
    const caption = texts.find((t) => t.length > 1);
    if (caption) norm.applyCaption(out, caption);

    const time = root.querySelector<HTMLTimeElement>("time[datetime]");
    if (time?.dateTime) meta.publishedAt = time.dateTime;
    const htmlLang = document.documentElement.lang?.trim();
    if (htmlLang) {
      out.lang = htmlLang;
      meta.lang = htmlLang;
    }

    const media: Array<HarvestedMedia> = [];
    const seen = new Set<string>();
    const push = (entry: HarvestedMedia) => {
      const url = entry.url;
      if (!url || /^blob:/i.test(url) || norm.isBrandAsset(url)) return;
      if (seen.has(url)) return;
      seen.add(url);
      media.push(entry);
    };

    let avatarUrl: string | null = null;
    for (const v of Array.from(
      root.querySelectorAll<HTMLVideoElement>("video"),
    )) {
      const poster = v.poster || undefined;
      const src = v.currentSrc || v.src;
      const url = src && !src.startsWith("blob:") ? src : poster;
      if (!url) continue;
      const dur = v.duration;
      const w = v.videoWidth;
      const h = v.videoHeight;
      const entry: HarvestedMedia = { url, type: "video" };
      if (poster) entry.poster = poster;
      if (Number.isFinite(dur) && dur > 0) entry.durationSec = Math.round(dur);
      if (w) entry.width = w;
      if (h) entry.height = h;
      push(entry);
    }
    for (const img of Array.from(
      root.querySelectorAll<HTMLImageElement>("img"),
    )) {
      const best =
        norm.pickLargestSrcset(img.srcset) ?? img.currentSrc ?? img.src;
      if (!best || best.startsWith("data:")) continue;
      if (norm.looksLikeAvatar(best, img.alt)) {
        if (!avatarUrl) avatarUrl = best;
        continue;
      }
      const alt = img.getAttribute("alt")?.trim();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const entry: HarvestedMedia = { url: best, type: "image" };
      if (alt) entry.altText = alt;
      if (w) entry.width = w;
      if (h) entry.height = h;
      push(entry);
    }
    if (avatarUrl) meta.authorAvatar = avatarUrl;

    const first = media[0];
    if (first) {
      out.mediaUrls = media;
      out.mediaUrl = first.url;
      out.mediaType = first.type;
      meta.media = media;
    }

    if (Object.keys(meta).length > 0) out.meta = meta;
    if (!out.author && !out.title && !out.mediaUrl) return null;
    return out;
  }
}

const HarvestedMediaSchema = z
  .object({
    url: z.string().optional().catch(undefined),
    type: z.string().optional().catch(undefined),
    poster: z.string().optional().catch(undefined),
    altText: z.string().optional().catch(undefined),
    durationSec: z.number().optional().catch(undefined),
    width: z.number().optional().catch(undefined),
    height: z.number().optional().catch(undefined),
  })
  .catch({});

type HarvestedMediaEntry = z.infer<typeof HarvestedMediaSchema>;

const HarvestedPostSchema = z
  .object({
    title: z.string().optional().catch(undefined),
    description: z.string().optional().catch(undefined),
    author: z.string().optional().catch(undefined),
    lang: z.string().optional().catch(undefined),
    mediaUrl: z.string().optional().catch(undefined),
    mediaUrls: z.array(HarvestedMediaSchema).optional().catch(undefined),
    mediaType: z.string().optional().catch(undefined),
    meta: z
      .looseObject({
        media: z.array(HarvestedMediaSchema).optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

function dropLanding(
  items: Array<HarvestedMediaEntry> | undefined,
): Array<HarvestedMediaEntry> | undefined {
  if (!items) {
    return undefined;
  }
  const kept = items.filter(
    (m) => m.url !== undefined && !isThreadsLandingMedia(m.url),
  );
  return kept.length > 0 ? kept : undefined;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx): Capture | null {
  const post = HarvestedPostSchema.parse(raw);
  const title =
    post.title !== undefined && !isThreadsLandingCopy(post.title)
      ? post.title
      : undefined;
  const description =
    post.description !== undefined && !isThreadsLandingCopy(post.description)
      ? post.description
      : undefined;
  const mediaUrls = dropLanding(post.mediaUrls);
  const mediaUrl =
    post.mediaUrl !== undefined && !isThreadsLandingMedia(post.mediaUrl)
      ? post.mediaUrl
      : mediaUrls?.[0]?.url;
  if (!title && !description && !mediaUrl && post.author === undefined) {
    return null;
  }
  const meta = post.meta;
  if (meta && Array.isArray(meta.media)) {
    const media = dropLanding(meta.media);
    if (media) meta.media = media;
    else delete meta.media;
  }
  const blob = { ...post, title, description };
  if (mediaUrl) blob.mediaUrl = mediaUrl;
  if (mediaUrls) blob.mediaUrls = mediaUrls;
  if (meta) blob.meta = meta;
  const page = parsePageBlob(blob);
  if (!page) return null;
  return captureFromTweetDraft(
    draftFromDomHarvest({
      source: "threads",
      id: ctx.sourceId,
      url: ctx.url,
      ...page,
    }),
  );
}
