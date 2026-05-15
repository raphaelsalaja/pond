import type { MediaType } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import type { ArenaChannel, RawArena } from "@pond/schema/raw";
import log from "electron-log/main.js";
import type { ListEntry, ListHarvestResult } from "../list-types";
import type { ScrapedHarvest } from "../types";

const V3_BASE = "https://api.are.na/v3";

const API_BASE = "https://api.are.na/v2";
const REQUEST_TIMEOUT_MS = 15_000;

const RATE_LIMIT_PER_MIN = 30;
const TOKEN_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MIN);

let nextTokenAt = 0;

async function acquireToken(): Promise<void> {
  const now = Date.now();
  const earliest = Math.max(now, nextTokenAt);
  nextTokenAt = earliest + TOKEN_INTERVAL_MS;
  const wait = earliest - now;
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
}

export interface ArenaApiFailure {
  ok: false;
  status: number;
  reason: "not_found" | "rate_limited" | "unauthorized" | "network" | "timeout";
}

export type ArenaApiResult<T> = { ok: true; value: T } | ArenaApiFailure;

async function fetchJson<T>(
  url: string,
  attempt = 0,
): Promise<ArenaApiResult<T>> {
  await acquireToken();
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "omit",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? "timeout"
        : "network";
    log.warn("[pond arena:api]", reason, url, message);
    return { ok: false, status: 0, reason };
  }

  if (res.status === 429 && attempt === 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    const waitMs = Number.isFinite(retryAfter)
      ? Math.max(1_000, retryAfter * 1_000)
      : 1_000;
    log.info("[pond arena:api] 429; retrying after", waitMs, url);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    return fetchJson<T>(url, attempt + 1);
  }
  if (res.status === 429) {
    return { ok: false, status: 429, reason: "rate_limited" };
  }
  if (res.status === 404) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, reason: "unauthorized" };
  }
  if (!res.ok) {
    log.warn("[pond arena:api] non-ok", res.status, url);
    return { ok: false, status: res.status, reason: "network" };
  }
  try {
    const json = (await res.json()) as T;
    return { ok: true, value: json };
  } catch (err) {
    log.warn("[pond arena:api] bad json", url, err);
    return { ok: false, status: res.status, reason: "network" };
  }
}

interface ArenaImageVariant {
  url?: string | null;
}
interface ArenaOriginalVariant extends ArenaImageVariant {
  width?: number | null;
  height?: number | null;
}
interface ArenaImage {
  original?: ArenaOriginalVariant | null;
  large?: ArenaImageVariant | null;
  display?: ArenaImageVariant | null;
  thumb?: ArenaImageVariant | null;
}
interface ArenaUser {
  id?: number | string | null;
  full_name?: string | null;
  username?: string | null;
  slug?: string | null;
  avatar?: string | null;
  avatar_image?: { thumb?: string | null; display?: string | null } | null;
}
interface ArenaSource {
  url?: string | null;
  title?: string | null;
}
interface ArenaAttachment {
  url?: string | null;
  content_type?: string | null;
  file_name?: string | null;
}
interface ArenaEmbed {
  url?: string | null;
  type?: string | null;
  source_url?: string | null;
  width?: number | null;
  height?: number | null;
}
interface ArenaConnectionsCount {
  count?: number | null;
}
interface ArenaChannelLite {
  id?: number | string | null;
  title?: string | null;
  slug?: string | null;
  href?: string | null;
}

export interface ArenaBlock {
  id?: number | string | null;
  class?: string | null;
  title?: string | null;
  generated_title?: string | null;
  description?: string | null;
  content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  image?: ArenaImage | null;
  user?: ArenaUser | null;
  source?: ArenaSource | null;
  attachment?: ArenaAttachment | null;
  embed?: ArenaEmbed | null;
  connections?: ArenaConnectionsCount | null;
  connections_count?: number | null;
  comment_count?: number | null;
  channels?: ArenaChannelLite[] | null;
}

export function fetchArenaBlock(
  blockId: string,
): Promise<ArenaApiResult<ArenaBlock>> {
  const url = `${API_BASE}/blocks/${encodeURIComponent(blockId)}`;
  return fetchJson<ArenaBlock>(url);
}

function pickMediaUrlAndDims(block: ArenaBlock): {
  url: string | null;
  width: number | null;
  height: number | null;
  type: MediaType;
  poster: string | null;
  embedUrl: string | null;
  attachmentUrl: string | null;
} {
  const original = block.image?.original ?? null;
  const originalUrl = typeof original?.url === "string" ? original.url : null;
  const largeUrl =
    typeof block.image?.large?.url === "string" ? block.image.large.url : null;
  const displayUrl =
    typeof block.image?.display?.url === "string"
      ? block.image.display.url
      : null;
  const thumbUrl =
    typeof block.image?.thumb?.url === "string" ? block.image.thumb.url : null;
  const cls = (block.class ?? "").toLowerCase();

  const poster = originalUrl ?? largeUrl ?? displayUrl ?? thumbUrl ?? null;
  const width = typeof original?.width === "number" ? original.width : null;
  const height = typeof original?.height === "number" ? original.height : null;

  if (cls === "media") {
    const embedUrl =
      typeof block.embed?.url === "string" ? block.embed.url : null;
    return {
      url: poster,
      width,
      height,
      type: "video",
      poster,
      embedUrl,
      attachmentUrl: null,
    };
  }
  if (poster) {
    return {
      url: poster,
      width,
      height,
      type: "image",
      poster: null,
      embedUrl: null,
      attachmentUrl: null,
    };
  }
  if (block.attachment?.url) {
    return {
      url: null,
      width: null,
      height: null,
      type: "link",
      poster: null,
      embedUrl: null,
      attachmentUrl: block.attachment.url,
    };
  }
  return {
    url: null,
    width: null,
    height: null,
    type: "link",
    poster: null,
    embedUrl: null,
    attachmentUrl: null,
  };
}

function channelsFromBlock(block: ArenaBlock): ArenaChannel[] {
  const out: ArenaChannel[] = [];
  const seen = new Set<string>();
  for (const c of block.channels ?? []) {
    if (!c) continue;
    const id = c.id != null ? String(c.id) : undefined;
    const key = id ?? c.slug ?? c.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry: ArenaChannel = {};
    if (id) entry.id = id;
    if (typeof c.title === "string") entry.title = c.title;
    if (typeof c.slug === "string") entry.slug = c.slug;
    if (typeof c.href === "string") entry.href = c.href;
    if (Object.keys(entry).length > 0) out.push(entry);
  }
  return out;
}

function clampDescription(value: string): string {
  return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
}

function buildArenaRaw(
  block: ArenaBlock,
  extra?: { channels?: ArenaChannel[] },
): RawArena {
  const arena: RawArena = {};
  if (typeof block.class === "string") arena.blockClass = block.class;
  if (typeof block.created_at === "string") {
    arena.publishedAt = block.created_at;
  }

  const u = block.user ?? {};
  if (typeof u.full_name === "string") arena.authorName = u.full_name;
  if (typeof u.slug === "string") {
    arena.authorSlug = u.slug;
    arena.authorUrl = `https://www.are.na/${u.slug}`;
  }
  const avatar =
    (typeof u.avatar_image?.thumb === "string" && u.avatar_image.thumb) ||
    (typeof u.avatar_image?.display === "string" && u.avatar_image.display) ||
    (typeof u.avatar === "string" && u.avatar) ||
    null;
  if (avatar) arena.authorAvatar = avatar;

  const metrics: NonNullable<RawArena["metrics"]> = {};
  const connFromObj = block.connections?.count;
  const connFromCount = block.connections_count;
  if (typeof connFromObj === "number") {
    metrics.connections = connFromObj;
  } else if (typeof connFromCount === "number") {
    metrics.connections = connFromCount;
  }
  if (typeof block.comment_count === "number") {
    metrics.comments = block.comment_count;
  }
  if (Object.keys(metrics).length > 0) arena.metrics = metrics;

  const channels = extra?.channels ?? channelsFromBlock(block);
  if (channels.length > 0) arena.channels = channels;

  const sourceUrl =
    typeof block.source?.url === "string" ? block.source.url : null;
  if (sourceUrl) arena.sourceUrl = sourceUrl;

  const attachmentUrl =
    typeof block.attachment?.url === "string" ? block.attachment.url : null;
  if (attachmentUrl) arena.attachmentUrl = attachmentUrl;

  const embedUrl =
    typeof block.embed?.url === "string" ? block.embed.url : null;
  if (embedUrl) arena.embedUrl = embedUrl;

  const content = typeof block.content === "string" ? block.content : null;
  if (content) arena.content = clampDescription(content);

  const variants: NonNullable<RawArena["imageVariants"]> = {};
  if (typeof block.image?.original?.url === "string") {
    variants.original = block.image.original.url;
  }
  if (typeof block.image?.large?.url === "string") {
    variants.large = block.image.large.url;
  }
  if (typeof block.image?.display?.url === "string") {
    variants.display = block.image.display.url;
  }
  if (typeof block.image?.thumb?.url === "string") {
    variants.thumb = block.image.thumb.url;
  }
  if (Object.keys(variants).length > 0) arena.imageVariants = variants;

  const original = block.image?.original ?? null;
  if (typeof original?.width === "number") arena.imageWidth = original.width;
  if (typeof original?.height === "number") arena.imageHeight = original.height;

  return arena;
}

export interface AdaptedBlock {
  sourceId: string;
  url: string;
  harvest: ScrapedHarvest;
  width?: number;
  height?: number;
  arenaUrl: string;
}

export function adaptBlock(
  block: ArenaBlock,
  opts: { channels?: ArenaChannel[] } = {},
): AdaptedBlock | null {
  const id = block.id != null ? String(block.id) : null;
  if (!id) return null;

  const media = pickMediaUrlAndDims(block);
  const arenaUrl = `https://www.are.na/block/${id}`;
  const url =
    typeof block.source?.url === "string" && block.source.url
      ? block.source.url
      : arenaUrl;

  const arena = buildArenaRaw(block, opts);

  const titleRaw =
    typeof block.title === "string" && block.title.trim().length > 0
      ? block.title.trim()
      : typeof block.generated_title === "string"
        ? block.generated_title.trim() || undefined
        : undefined;

  const descriptionRaw =
    typeof block.description === "string" && block.description.trim().length > 0
      ? clampDescription(block.description.trim())
      : typeof block.content === "string" && block.content.trim().length > 0
        ? clampDescription(block.content.trim())
        : undefined;

  const authorRaw =
    typeof block.user?.full_name === "string" &&
    block.user.full_name.trim().length > 0
      ? block.user.full_name.trim()
      : typeof block.user?.username === "string" && block.user.username
        ? block.user.username
        : undefined;

  const mediaUrl = media.url ?? undefined;
  const mediaEntry: ScrapedHarvest["mediaUrls"] =
    mediaUrl !== undefined
      ? [
          {
            url: mediaUrl,
            type: media.type,
            ...(media.poster ? { poster: media.poster } : {}),
          },
        ]
      : undefined;

  const harvest: ScrapedHarvest = {
    ...(titleRaw ? { title: titleRaw } : {}),
    ...(descriptionRaw ? { description: descriptionRaw } : {}),
    ...(authorRaw ? { author: authorRaw } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaEntry ? { mediaUrls: mediaEntry } : {}),
    mediaType: media.type,
    meta: arena as Record<string, unknown>,
  };

  const out: AdaptedBlock = {
    sourceId: id,
    url,
    arenaUrl,
    harvest,
  };
  if (media.width != null) out.width = media.width;
  if (media.height != null) out.height = media.height;
  return out;
}

export interface ArenaRefreshOk {
  ok: true;
  payload: IngestPayload;
  width?: number;
  height?: number;
}

export type ArenaRefreshResult = ArenaRefreshOk | { ok: false; reason: string };

export async function refreshFromArenaApi(args: {
  sourceId: string;
}): Promise<ArenaRefreshResult> {
  const fetched = await fetchArenaBlock(args.sourceId);
  if (!fetched.ok) {
    return { ok: false, reason: fetched.reason };
  }
  const adapted = adaptBlock(fetched.value);
  if (!adapted) return { ok: false, reason: "no_match" };

  const meta = adapted.harvest.meta ?? {};
  const payload: IngestPayload = {
    source: "arena",
    sourceId: adapted.sourceId,
    url: adapted.url,
    title: adapted.harvest.title ?? null,
    description: adapted.harvest.description ?? null,
    author: adapted.harvest.author ?? null,
    mediaUrl: adapted.harvest.mediaUrl ?? null,
    mediaUrls: adapted.harvest.mediaUrls?.map((m) => ({
      url: m.url,
      ...(m.type ? { type: m.type } : {}),
      ...(m.poster ? { poster: m.poster } : {}),
      ...(adapted.width != null ? { width: adapted.width } : {}),
      ...(adapted.height != null ? { height: adapted.height } : {}),
    })),
    mediaType: adapted.harvest.mediaType ?? null,
    raw: {
      kind: "arena-api-refresh",
      capturedAt: new Date().toISOString(),
      arena: meta,
    },
  };
  const result: ArenaRefreshOk = { ok: true, payload };
  if (adapted.width != null) result.width = adapted.width;
  if (adapted.height != null) result.height = adapted.height;
  return result;
}

export interface ArenaListArgs {
  knownIds: ReadonlySet<string>;
  onProgress?: (collected: number, fresh: number) => void;
}

interface V3ImageVariant {
  src?: string | null;
  src_2x?: string | null;
  width?: number | null;
  height?: number | null;
}

interface V3Image extends V3ImageVariant {
  alt_text?: string | null;
  blurhash?: string | null;
  aspect_ratio?: number | null;
  content_type?: string | null;
  small?: V3ImageVariant | null;
  medium?: V3ImageVariant | null;
  large?: V3ImageVariant | null;
  square?: V3ImageVariant | null;
}

interface V3Source {
  url?: string | null;
  title?: string | null;
  provider?: { name?: string | null; url?: string | null } | null;
}

interface V3User {
  id?: number | null;
  type?: string | null;
  name?: string | null;
  slug?: string | null;
  avatar?: string | null;
}

interface V3ContentItem {
  id?: number | string | null;
  type?: string | null;
  base_type?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  state?: string | null;
  visibility?: string | null;
  user?: V3User | null;
  owner?: V3User | null;
  source?: V3Source | null;
  image?: V3Image | null;
}

interface V3ContentsResponse {
  data?: V3ContentItem[];
  meta?: {
    current_page?: number | null;
    next_page?: number | null;
    total_pages?: number | null;
    total_count?: number | null;
    has_more_pages?: boolean | null;
  } | null;
}

function fetchArenaUserContentsV3(
  slug: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<ArenaApiResult<V3ContentsResponse>> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 100;
  const url = `${V3_BASE}/users/${encodeURIComponent(slug)}/contents?page=${page}&per=${perPage}`;
  return fetchJson<V3ContentsResponse>(url);
}

function pickV3MediaUrl(image: V3Image): string | null {
  return (
    image.large?.src ??
    image.medium?.src ??
    image.src ??
    image.small?.src ??
    image.square?.src ??
    null
  );
}

function adaptV3ContentItem(item: V3ContentItem): ListEntry | null {
  if (item.base_type !== "Block") return null;
  const id = item.id != null ? String(item.id) : null;
  if (!id) return null;

  const arenaUrl = `https://www.are.na/block/${id}`;
  const sourceUrl =
    typeof item.source?.url === "string" && item.source.url.length > 0
      ? item.source.url
      : null;
  const url = sourceUrl ?? arenaUrl;

  const image = item.image ?? null;
  const mediaUrl = image ? pickV3MediaUrl(image) : null;
  const width =
    typeof image?.width === "number"
      ? image.width
      : (image?.large?.width ?? null);
  const height =
    typeof image?.height === "number"
      ? image.height
      : (image?.large?.height ?? null);

  const type = (item.type ?? "").toLowerCase();
  const mediaType: MediaType =
    type === "media" || type === "video"
      ? "video"
      : mediaUrl
        ? "image"
        : "link";

  const title = (() => {
    const t = typeof item.title === "string" ? item.title.trim() : "";
    return t.length > 0 ? t : null;
  })();

  const description = (() => {
    const d =
      typeof item.description === "string" ? item.description.trim() : "";
    if (d.length > 0) return d.length > 4_000 ? `${d.slice(0, 4_000)}…` : d;
    const c = typeof item.content === "string" ? item.content.trim() : "";
    if (c.length === 0) return null;
    return c.length > 4_000 ? `${c.slice(0, 4_000)}…` : c;
  })();

  const arena: RawArena = {};
  if (typeof item.type === "string") arena.blockClass = item.type;
  if (typeof item.created_at === "string") arena.publishedAt = item.created_at;

  const u = item.user ?? item.owner ?? null;
  if (u) {
    if (typeof u.name === "string") arena.authorName = u.name;
    if (typeof u.slug === "string") {
      arena.authorSlug = u.slug;
      arena.authorUrl = `https://www.are.na/${u.slug}`;
    }
    if (typeof u.avatar === "string") arena.authorAvatar = u.avatar;
  }

  if (sourceUrl) arena.sourceUrl = sourceUrl;
  if (typeof item.content === "string" && item.content.trim().length > 0) {
    const c = item.content.trim();
    arena.content = c.length > 4_000 ? `${c.slice(0, 4_000)}…` : c;
  }

  if (image) {
    const variants: NonNullable<RawArena["imageVariants"]> = {};
    if (typeof image.src === "string") variants.original = image.src;
    if (typeof image.large?.src === "string") variants.large = image.large.src;
    if (typeof image.medium?.src === "string")
      variants.display = image.medium.src;
    if (typeof image.small?.src === "string") variants.thumb = image.small.src;
    if (Object.keys(variants).length > 0) arena.imageVariants = variants;
    if (typeof image.width === "number") arena.imageWidth = image.width;
    if (typeof image.height === "number") arena.imageHeight = image.height;
  }

  const mediaEntry =
    mediaUrl !== null
      ? [
          {
            url: mediaUrl,
            type: mediaType,
            ...(width != null ? { width } : {}),
            ...(height != null ? { height } : {}),
          },
        ]
      : undefined;

  const author =
    typeof u?.name === "string" && u.name.trim().length > 0
      ? u.name.trim()
      : typeof u?.slug === "string" && u.slug
        ? u.slug
        : undefined;

  const entry: ListEntry = {
    sourceId: id,
    url,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaEntry ? { mediaUrls: mediaEntry } : {}),
    mediaType,
    ...(item.created_at ? { savedAt: item.created_at } : {}),
    meta: arena as Record<string, unknown>,
  };
  return entry;
}

export async function harvestArenaListViaApi(
  handle: string,
  args: ArenaListArgs,
): Promise<ListHarvestResult> {
  const slug = handle.replace(/^@/, "").trim();
  if (!slug) {
    return { ok: false, reason: "auth_required" };
  }

  const entriesById = new Map<string, ListEntry>();
  let knownStreakPages = 0;

  for (let page = 1; page <= 500; page += 1) {
    const res = await fetchArenaUserContentsV3(slug, { page, perPage: 100 });
    if (!res.ok) {
      if (res.reason === "not_found" || res.reason === "unauthorized") {
        return { ok: false, reason: "auth_required" };
      }
      if (res.reason === "rate_limited" || res.reason === "timeout") {
        return { ok: false, reason: "timeout" };
      }
      return { ok: false, reason: "unknown" };
    }

    const items = res.value.data ?? [];
    if (items.length === 0) break;

    let allKnownThisPage = true;
    for (const item of items) {
      const id = item.id != null ? String(item.id) : null;
      if (!id) continue;
      if (args.knownIds.has(id)) continue;
      allKnownThisPage = false;
      if (entriesById.has(id)) continue;

      const entry = adaptV3ContentItem(item);
      if (!entry) continue;
      entriesById.set(id, entry);
      if (args.onProgress) {
        args.onProgress(entriesById.size, entriesById.size);
      }
    }

    // Stop early once we've crossed into the already-imported tail. v3
    // contents is ordered newest-first, so two solid pages of known IDs in a
    // row is a strong signal that the rest is older than our cutoff.
    if (allKnownThisPage) {
      knownStreakPages += 1;
      if (knownStreakPages >= 2) break;
    } else {
      knownStreakPages = 0;
    }

    const meta = res.value.meta;
    const hasMore = meta?.has_more_pages ?? null;
    const total = meta?.total_pages ?? null;
    if (hasMore === false) break;
    if (typeof total === "number" && total > 0 && page >= total) break;
  }

  log.info("[pond arena:api] v3 contents harvested", {
    slug,
    fresh: entriesById.size,
    known: args.knownIds.size,
  });

  return {
    ok: true,
    entries: Array.from(entriesById.values()),
    reachedEnd: true,
  };
}
