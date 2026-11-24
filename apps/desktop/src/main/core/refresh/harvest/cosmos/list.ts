import type { BrowserValidators } from "../lib/browser-validation";
import { browserValidationSource } from "../lib/browser-validation-source";
/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";

interface JsonRecord {
  [key: string]: JsonValue;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | JsonRecord;

export const COSMOS_LIST_URL = "https://www.cosmos.so/library";

const SCROLL_DEADLINE_MS = 60_000;

export function buildCosmosListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageCosmosList.toString()})`;
  const enriched = { ...args, scrollDeadlineMs: SCROLL_DEADLINE_MS };
  return `(async () => {
    ${browserValidationSource}
    const validators = PondHarvestValidation.browserValidators;
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args, validators); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

async function inPageCosmosList(
  args: ListHarvestArgs & { scrollDeadlineMs: number },
  validators: BrowserValidators,
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/sign-in") ||
    location.pathname.startsWith("/auth")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  interface CosmosEntryMedia {
    url: string;
    type?: MediaType;
    poster?: string;
  }

  interface CosmosEntry {
    sourceId: string;
    url: string;
    title?: string;
    description?: string;
    author?: string;
    mediaUrl?: string;
    mediaUrls?: Array<CosmosEntryMedia>;
    mediaType?: MediaType;
    savedAt?: string;
  }

  const isRecord = (value: unknown): value is JsonRecord =>
    validators.object.safeParse(value).success;
  const isWalkable = (value: unknown): value is JsonValue =>
    Array.isArray(value) || isRecord(value);
  const asText = (value: JsonValue | undefined): string | undefined =>
    validators.text.safeParse(value).data;
  const asNumber = (value: JsonValue | undefined): number | undefined =>
    validators.number.safeParse(value).data;

  const known = new Set(args.knownIds.map(String));
  const collected = new Map<string, CosmosEntry>();

  const upgradeCosmosImage = (src: string): string => {
    try {
      const u = new URL(src, location.origin);
      if (!/(^|\.)cosmos\.so$/i.test(u.hostname)) {
        return src;
      }
      if (!u.hostname.startsWith("cdn.")) {
        return src;
      }
      for (const key of [
        "w",
        "h",
        "width",
        "height",
        "q",
        "quality",
        "dpr",
        "fit",
        "blur",
      ]) {
        u.searchParams.delete(key);
      }
      return u.toString();
    } catch {
      return src;
    }
  };

  const pickString = (
    record: JsonRecord,
    keys: Array<string>,
  ): string | undefined => {
    for (const k of keys) {
      const v = asText(record[k]);
      if (v !== undefined && v.trim().length > 0) {
        return v.trim();
      }
    }
    return undefined;
  };

  const readElementId = (record: JsonRecord): string | null => {
    const candidates = [
      record.id,
      record.elementId,
      record.element_id,
      record.nodeId,
    ];
    for (const c of candidates) {
      const numeric = asNumber(c);
      if (numeric !== undefined && Number.isInteger(numeric) && numeric > 0) {
        return String(numeric);
      }
      const text = asText(c);
      if (text !== undefined && /^\d+$/.test(text) && text !== "0") {
        return text;
      }
    }
    return null;
  };

  const detectMediaTypeFromUrl = (
    url: string,
  ): "image" | "video" | undefined => {
    if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) {
      return "video";
    }
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) {
      return "image";
    }
    return undefined;
  };

  interface TileMedia {
    mediaUrl?: string;
    poster?: string;
    type: MediaType;
  }

  const mediaFromTile = (tile: JsonRecord): TileMedia => {
    const media = tile.media;
    if (!isRecord(media)) {
      return { type: "link" };
    }
    const typename = String(media.__typename ?? "").toLowerCase();
    if (typename.includes("video")) {
      const mux = isRecord(media.mux) ? media.mux : undefined;
      const thumbnail = isRecord(media.thumbnail) ? media.thumbnail : undefined;
      const playback =
        asText(mux?.mp4Url) ||
        asText(mux?.playbackUrl) ||
        asText(media.url) ||
        undefined;
      const poster = asText(thumbnail?.url) || asText(media.url) || undefined;
      return {
        mediaUrl: playback,
        poster,
        type: "video",
      };
    }
    if (typename.includes("animated")) {
      const video = isRecord(media.video) ? media.video : undefined;
      const videoUrl = asText(video?.url);
      const stillUrl = asText(media.url);
      return {
        mediaUrl: videoUrl ?? stillUrl,
        poster: stillUrl,
        type: videoUrl ? "video" : "image",
      };
    }
    const staticUrl = asText(media.url);
    const guessed = staticUrl ? detectMediaTypeFromUrl(staticUrl) : undefined;
    return {
      mediaUrl: staticUrl,
      type: guessed ?? "image",
    };
  };

  interface TileAuthor {
    author?: string;
    authorUrl?: string;
    avatarUrl?: string;
  }

  const authorFromTile = (tile: JsonRecord): TileAuthor => {
    const source = tile.source;
    if (!isRecord(source)) {
      return {};
    }
    const author = source.author;
    if (!isRecord(author)) {
      return {};
    }
    const username = pickString(author, ["username"]);
    const fullName = pickString(author, ["fullName"]);
    const profileUrl = pickString(author, ["profileUrl"]);
    const avatarUrl = pickString(author, ["avatarUrl"]);
    const name = username
      ? username.startsWith("@")
        ? username
        : `@${username}`
      : fullName;
    const out: TileAuthor = {};
    if (name) {
      out.author = name;
    }
    if (profileUrl) {
      out.authorUrl = profileUrl;
    }
    if (avatarUrl) {
      out.avatarUrl = avatarUrl;
    }
    return out;
  };

  const titleFromTile = (tile: JsonRecord): string | undefined => {
    const websiteTitle = pickString(tile, ["websiteTitle"]);
    if (websiteTitle) {
      return websiteTitle;
    }
    const cap = isRecord(tile.generatedCaption)
      ? tile.generatedCaption
      : undefined;
    const capText = cap ? pickString(cap, ["text"]) : undefined;
    if (capText) {
      const cleaned = capText.replaceAll(/<\/?n>/g, "").trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
    return undefined;
  };

  const descriptionFromTile = (tile: JsonRecord): string | undefined => {
    const websiteDescription = pickString(tile, ["websiteDescription"]);
    if (!websiteDescription) {
      return undefined;
    }
    return websiteDescription.length > 4000
      ? `${websiteDescription.slice(0, 4000)}…`
      : websiteDescription;
  };

  const entryFromTile = (tile: JsonRecord): CosmosEntry | null => {
    const typename = String(tile.__typename ?? "");
    if (
      typename !== "MediaElementTile" &&
      typename !== "WebsiteElementTile" &&
      !/elementtile/i.test(typename)
    ) {
      return null;
    }
    const id = readElementId(tile);
    if (!id) {
      return null;
    }

    const shareUrl = asText(tile.shareUrl) || `https://www.cosmos.so/e/${id}`;

    const media = mediaFromTile(tile);
    const author = authorFromTile(tile);
    const title = titleFromTile(tile);
    const description = descriptionFromTile(tile);

    const entry: CosmosEntry = {
      sourceId: id,
      url: shareUrl,
    };
    if (title) {
      entry.title = title;
    }
    if (description) {
      entry.description = description;
    }
    if (author.author) {
      entry.author = author.author;
    }
    if (media.mediaUrl) {
      const url =
        media.type === "image"
          ? upgradeCosmosImage(media.mediaUrl)
          : media.mediaUrl;
      const poster = media.poster
        ? upgradeCosmosImage(media.poster)
        : undefined;
      entry.mediaUrl = url;
      const mediaEntry: CosmosEntryMedia = { url, type: media.type };
      if (poster) {
        mediaEntry.poster = poster;
      }
      entry.mediaUrls = [mediaEntry];
      entry.mediaType = media.type;
    } else {
      entry.mediaType = "link";
    }
    const createdAt = asText(tile.createdAt);
    if (createdAt !== undefined) {
      entry.savedAt = createdAt;
    }
    return entry;
  };

  interface IngestResult {
    added: number;
  }

  const walk = (root: JsonValue): IngestResult => {
    let added = 0;
    const stack: Array<JsonValue> = [root];
    let safety = 250_000;
    while (stack.length > 0 && safety > 0) {
      safety -= 1;
      const node = stack.pop();
      if (node === null || node === undefined) {
        continue;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          stack.push(child);
        }
        continue;
      }
      if (!isRecord(node)) {
        continue;
      }
      const entry = entryFromTile(node);
      if (entry && !collected.has(entry.sourceId)) {
        collected.set(entry.sourceId, entry);
        added += 1;
        continue;
      }
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (child !== undefined && (Array.isArray(child) || isRecord(child))) {
          stack.push(child);
        }
      }
    }
    return { added };
  };

  interface ApolloDevtoolsClient {
    cache?: { extract?: () => JsonValue };
  }

  const isApolloClient = (value: unknown): value is ApolloDevtoolsClient =>
    isRecord(value);

  const readApolloSSR = (): JsonValue | null => {
    try {
      const sym = Symbol.for("ApolloSSRDataTransport");
      const transport: unknown = Object.getOwnPropertyDescriptor(
        globalThis,
        sym,
      )?.value;
      return isWalkable(transport) ? transport : null;
    } catch {
      return null;
    }
  };

  const readApolloCache = (): JsonValue | null => {
    try {
      const client: unknown = Object.getOwnPropertyDescriptor(
        globalThis,
        "__APOLLO_CLIENT__",
      )?.value;
      const extracted = isApolloClient(client)
        ? client.cache?.extract?.()
        : undefined;
      return extracted ?? null;
    } catch {
      return null;
    }
  };

  const collectFromDom = (): IngestResult => {
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
        /** A malformed link leaves `id` null and is skipped. */
      }
      if (!id) {
        continue;
      }
      if (collected.has(id)) {
        continue;
      }

      const card =
        a.closest("article, li, [class*='Tile'], [class*='tile']") ?? a;
      const img = card.querySelector<HTMLImageElement>("img");
      const src = img?.currentSrc ?? img?.src ?? undefined;
      const mediaUrl =
        src !== undefined && !src.startsWith("data:")
          ? upgradeCosmosImage(src)
          : undefined;
      const title = img?.alt?.trim() || undefined;
      const hasVideo = !!card.querySelector("video, [data-type='video']");

      const entry: CosmosEntry = {
        sourceId: id,
        url: `https://www.cosmos.so/e/${id}`,
      };
      if (title) {
        entry.title = title;
      }
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
    if (ssr) {
      walk(ssr);
    }
    const cache = readApolloCache();
    if (cache) {
      walk(cache);
    }
    collectFromDom();
  };

  const freshEntries = (): Array<CosmosEntry> => {
    const out: Array<CosmosEntry> = [];
    for (const [id, e] of collected) {
      if (known.has(id)) {
        continue;
      }
      out.push(e);
    }
    return out;
  };

  interface HarvestStats {
    phase: "hydrate" | "scroll";
    collected: number;
    fresh: number;
    scrolls: number;
    updatedAt: number;
  }

  const stats: HarvestStats = {
    phase: "hydrate",
    collected: 0,
    fresh: 0,
    scrolls: 0,
    updatedAt: Date.now(),
  };
  Object.assign(globalThis, { __pondHarvestStats: stats });
  const publishStats = (phase: HarvestStats["phase"]): void => {
    stats.phase = phase;
    stats.collected = collected.size;
    let fresh = 0;
    for (const id of collected.keys()) {
      if (!known.has(id)) {
        fresh += 1;
      }
    }
    stats.fresh = fresh;
    stats.updatedAt = Date.now();
  };

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
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  ingestAll();
  publishStats("scroll");

  const countFresh = (): number => {
    let n = 0;
    for (const id of collected.keys()) {
      if (!known.has(id)) {
        n += 1;
      }
    }
    return n;
  };

  const earlyStopEnabled = known.size > 0;
  const STOP_AFTER_KNOWN_SCROLLS = 3;
  let knownScrollStreak = 0;
  let lastFresh = countFresh();

  const scrollDeadline = Date.now() + args.scrollDeadlineMs;
  let stable = 0;
  let lastSize = collected.size;
  while (Date.now() < scrollDeadline) {
    window.scrollBy({
      top: window.innerHeight * 0.9,
      behavior: "instant",
    });
    await new Promise((r) => {
      setTimeout(r, 700 + Math.random() * 300);
    });
    stats.scrolls += 1;
    ingestAll();
    publishStats("scroll");
    const grew = collected.size !== lastSize;
    const freshNow = countFresh();
    if (earlyStopEnabled && grew && freshNow === lastFresh) {
      knownScrollStreak += 1;
      if (knownScrollStreak >= STOP_AFTER_KNOWN_SCROLLS) {
        return { ok: true, entries: freshEntries(), reachedEnd: true };
      }
    } else if (freshNow !== lastFresh) {
      knownScrollStreak = 0;
    }
    lastFresh = freshNow;
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
