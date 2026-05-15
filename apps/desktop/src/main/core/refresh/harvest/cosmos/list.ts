/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";

export function cosmosProfileUrl(handle: string): string {
  return `https://www.cosmos.so/${encodeURIComponent(handle)}`;
}

export const COSMOS_LIST_URL = "https://www.cosmos.so/library";

const SCROLL_DEADLINE_MS = 60_000;

export function buildCosmosListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageCosmosList.toString()})`;
  const enriched = { ...args, scrollDeadlineMs: SCROLL_DEADLINE_MS };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageCosmosList(
  args: ListHarvestArgs & { scrollDeadlineMs: number },
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/sign-in") ||
    location.pathname.startsWith("/auth")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  interface CosmosEntry {
    sourceId: string;
    url: string;
    title?: string;
    description?: string;
    author?: string;
    mediaUrl?: string;
    mediaUrls?: Array<{
      url: string;
      type?: MediaType;
      poster?: string;
    }>;
    mediaType?: MediaType;
    savedAt?: string;
    meta?: Record<string, unknown>;
  }

  const known = new Set(args.knownIds.map(String));
  const collected = new Map<string, CosmosEntry>();

  const pickString = (
    obj: Record<string, unknown>,
    keys: string[],
  ): string | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return undefined;
  };

  const readElementId = (obj: Record<string, unknown>): string | null => {
    const candidates: unknown[] = [
      obj.id,
      obj.elementId,
      obj.element_id,
      obj.nodeId,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isInteger(c) && c > 0) {
        return String(c);
      }
      if (typeof c === "string" && /^\d+$/.test(c) && c !== "0") return c;
    }
    return null;
  };

  const detectMediaTypeFromUrl = (
    url: string,
  ): "image" | "video" | undefined => {
    if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) return "video";
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return "image";
    return undefined;
  };

  const mediaFromTile = (
    obj: Record<string, unknown>,
  ): {
    mediaUrl?: string;
    poster?: string;
    type: MediaType;
  } => {
    const media = obj.media as Record<string, unknown> | undefined;
    if (!media || typeof media !== "object") {
      return { type: "link" };
    }
    const typename = String(media.__typename ?? "").toLowerCase();
    if (typename.includes("video")) {
      const mux = media.mux as Record<string, unknown> | undefined;
      const thumbnail = media.thumbnail as Record<string, unknown> | undefined;
      const playback =
        (typeof mux?.mp4Url === "string" && mux.mp4Url) ||
        (typeof mux?.playbackUrl === "string" && mux.playbackUrl) ||
        (typeof media.url === "string" && media.url) ||
        undefined;
      const poster =
        (typeof thumbnail?.url === "string" && thumbnail.url) ||
        (typeof media.url === "string" && media.url) ||
        undefined;
      return {
        mediaUrl: playback,
        poster: typeof poster === "string" ? poster : undefined,
        type: "video",
      };
    }
    if (typename.includes("animated")) {
      const video = media.video as Record<string, unknown> | undefined;
      const videoUrl = typeof video?.url === "string" ? video.url : undefined;
      const stillUrl = typeof media.url === "string" ? media.url : undefined;
      return {
        mediaUrl: videoUrl ?? stillUrl,
        poster: stillUrl,
        type: videoUrl ? "video" : "image",
      };
    }
    const staticUrl = typeof media.url === "string" ? media.url : undefined;
    const guessed = staticUrl ? detectMediaTypeFromUrl(staticUrl) : undefined;
    return {
      mediaUrl: staticUrl,
      type: guessed ?? "image",
    };
  };

  const authorFromTile = (
    obj: Record<string, unknown>,
  ): { author?: string; authorUrl?: string; avatarUrl?: string } => {
    const source = obj.source as Record<string, unknown> | undefined;
    if (!source || typeof source !== "object") return {};
    const author = source.author as Record<string, unknown> | undefined;
    if (!author || typeof author !== "object") return {};
    const username = pickString(author, ["username"]);
    const fullName = pickString(author, ["fullName"]);
    const profileUrl = pickString(author, ["profileUrl"]);
    const avatarUrl = pickString(author, ["avatarUrl"]);
    const name = username
      ? username.startsWith("@")
        ? username
        : `@${username}`
      : fullName;
    return {
      ...(name ? { author: name } : {}),
      ...(profileUrl ? { authorUrl: profileUrl } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  };

  const titleFromTile = (obj: Record<string, unknown>): string | undefined => {
    const websiteTitle = pickString(obj, ["websiteTitle"]);
    if (websiteTitle) return websiteTitle;
    const cap = obj.generatedCaption as Record<string, unknown> | undefined;
    const capText = cap ? pickString(cap, ["text"]) : undefined;
    if (capText) {
      const cleaned = capText.replace(/<\/?n>/g, "").trim();
      if (cleaned.length > 0) return cleaned;
    }
    return undefined;
  };

  const descriptionFromTile = (
    obj: Record<string, unknown>,
  ): string | undefined => {
    const websiteDescription = pickString(obj, ["websiteDescription"]);
    if (!websiteDescription) return undefined;
    return websiteDescription.length > 4000
      ? `${websiteDescription.slice(0, 4000)}…`
      : websiteDescription;
  };

  const shapeTile = (obj: Record<string, unknown>): CosmosEntry | null => {
    const typename = String(obj.__typename ?? "");
    if (
      typename !== "MediaElementTile" &&
      typename !== "WebsiteElementTile" &&
      !/elementtile/i.test(typename)
    ) {
      return null;
    }
    const id = readElementId(obj);
    if (!id) return null;

    const shareUrl =
      typeof obj.shareUrl === "string" && obj.shareUrl.length > 0
        ? obj.shareUrl
        : `https://www.cosmos.so/e/${id}`;

    const media = mediaFromTile(obj);
    const author = authorFromTile(obj);
    const title = titleFromTile(obj);
    const description = descriptionFromTile(obj);

    const source = obj.source as Record<string, unknown> | undefined;
    const sourceUrl =
      source && typeof source.url === "string" ? source.url : undefined;

    const meta: Record<string, unknown> = {};
    if (typename) meta.tileType = typename;
    if (sourceUrl) meta.sourceUrl = sourceUrl;
    if (author.authorUrl) meta.authorUrl = author.authorUrl;
    if (author.avatarUrl) meta.authorAvatar = author.avatarUrl;
    if (typeof obj.createdAt === "string") meta.publishedAt = obj.createdAt;
    if (typeof obj.originalClusterId === "number") {
      meta.originalClusterId = obj.originalClusterId;
    }
    const mediaNode = obj.media as Record<string, unknown> | undefined;
    if (mediaNode) {
      const mediaId = pickString(mediaNode, ["mediaId"]);
      if (mediaId) meta.mediaId = mediaId;
      if (typeof mediaNode.width === "number") {
        meta.mediaWidth = mediaNode.width;
      }
      if (typeof mediaNode.height === "number") {
        meta.mediaHeight = mediaNode.height;
      }
    }

    const entry: CosmosEntry = {
      sourceId: id,
      url: shareUrl,
    };
    if (title) entry.title = title;
    if (description) entry.description = description;
    if (author.author) entry.author = author.author;
    if (media.mediaUrl) {
      entry.mediaUrl = media.mediaUrl;
      entry.mediaUrls = [
        {
          url: media.mediaUrl,
          type: media.type,
          ...(media.poster ? { poster: media.poster } : {}),
        },
      ];
      entry.mediaType = media.type;
    } else {
      entry.mediaType = "link";
    }
    if (typeof obj.createdAt === "string") entry.savedAt = obj.createdAt;
    if (Object.keys(meta).length > 0) entry.meta = meta;
    return entry;
  };

  const _isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const walk = (root: unknown): { added: number } => {
    let added = 0;
    const stack: unknown[] = [root];
    let safety = 250_000;
    while (stack.length > 0 && safety > 0) {
      safety -= 1;
      const node = stack.pop();
      if (node === null || node === undefined) continue;
      if (Array.isArray(node)) {
        for (const child of node) stack.push(child);
        continue;
      }
      if (typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const entry = shapeTile(obj);
      if (entry && !collected.has(entry.sourceId)) {
        collected.set(entry.sourceId, entry);
        added += 1;
        continue;
      }
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (child && typeof child === "object") stack.push(child);
      }
    }
    return { added };
  };

  const readApolloSSR = (): unknown => {
    try {
      const sym = Symbol.for("ApolloSSRDataTransport");
      return (globalThis as unknown as Record<symbol, unknown>)[sym];
    } catch {
      return null;
    }
  };

  const readApolloCache = (): unknown => {
    try {
      const ac = (
        globalThis as unknown as {
          __APOLLO_CLIENT__?: { cache?: { extract?: () => unknown } };
        }
      ).__APOLLO_CLIENT__;
      const extracted = ac?.cache?.extract?.();
      return extracted ?? null;
    } catch {
      return null;
    }
  };

  const collectFromDom = (): { added: number } => {
    let added = 0;
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/e/"]'),
    );
    for (const a of anchors) {
      let id: string | null = null;
      try {
        const u = new URL(a.href, location.origin);
        id = u.pathname.match(/\/e\/(\d+)/)?.[1] ?? null;
      } catch {
        /* unparseable */
      }
      if (!id) continue;
      if (collected.has(id)) continue;

      const card =
        a.closest("article, li, [class*='Tile'], [class*='tile']") ?? a;
      const img = card.querySelector<HTMLImageElement>("img");
      const src = img?.currentSrc ?? img?.src ?? undefined;
      const mediaUrl =
        typeof src === "string" && !src.startsWith("data:") ? src : undefined;
      const title = img?.alt?.trim() || undefined;
      const hasVideo = !!card.querySelector("video, [data-type='video']");

      const entry: CosmosEntry = {
        sourceId: id,
        url: `https://www.cosmos.so/e/${id}`,
      };
      if (title) entry.title = title;
      if (mediaUrl) {
        entry.mediaUrl = mediaUrl;
        entry.mediaUrls = [{ url: mediaUrl, type: "image" }];
        entry.mediaType = "image";
      } else {
        entry.mediaType = hasVideo ? "video" : "link";
      }
      collected.set(id, entry);
      added += 1;
    }
    return { added };
  };

  const ingestAll = (): void => {
    const ssr = readApolloSSR();
    if (ssr) walk(ssr);
    const cache = readApolloCache();
    if (cache) walk(cache);
    collectFromDom();
  };

  const freshEntries = (): CosmosEntry[] => {
    const out: CosmosEntry[] = [];
    for (const [id, e] of collected) {
      if (known.has(id)) continue;
      out.push(e);
    }
    return out;
  };

  const stats: {
    phase: "hydrate" | "scroll";
    collected: number;
    fresh: number;
    scrolls: number;
    updatedAt: number;
  } = {
    phase: "hydrate",
    collected: 0,
    fresh: 0,
    scrolls: 0,
    updatedAt: Date.now(),
  };
  (
    globalThis as unknown as { __pondHarvestStats?: typeof stats }
  ).__pondHarvestStats = stats;
  const publishStats = (phase: typeof stats.phase): void => {
    stats.phase = phase;
    stats.collected = collected.size;
    let fresh = 0;
    for (const id of collected.keys()) if (!known.has(id)) fresh += 1;
    stats.fresh = fresh;
    stats.updatedAt = Date.now();
  };

  // Wait for at least one element to be rendered so SSR data is in place.
  const hydrateDeadline = Date.now() + 20_000;
  while (Date.now() < hydrateDeadline) {
    if (
      document.querySelector('a[href*="/e/"]') ||
      readApolloSSR() ||
      readApolloCache()
    ) {
      break;
    }
    publishStats("hydrate");
    await new Promise((r) => setTimeout(r, 250));
  }
  ingestAll();
  publishStats("scroll");

  const scrollDeadline = Date.now() + args.scrollDeadlineMs;
  let stable = 0;
  let lastSize = collected.size;
  while (Date.now() < scrollDeadline) {
    window.scrollBy({
      top: window.innerHeight * 0.9,
      behavior: "instant" as ScrollBehavior,
    });
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 300));
    stats.scrolls += 1;
    ingestAll();
    publishStats("scroll");
    if (collected.size === lastSize) {
      stable += 1;
      if (stable >= 5) {
        return {
          ok: true,
          entries: freshEntries(),
          reachedEnd: true,
        };
      }
    } else {
      stable = 0;
      lastSize = collected.size;
    }
  }

  return {
    ok: true,
    entries: freshEntries(),
    reachedEnd: false,
  };
}
