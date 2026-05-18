import type { MediaType } from "@pond/schema/db";
import type { Capture, CaptureMedia, CaptureMetrics } from "@pond/schema/raw";
import log from "electron-log/main.js";
import type { ListEntry, ListHarvestResult } from "../list-types";

interface ArenaChannelInfo {
  id?: string;
  title?: string;
  slug?: string;
  href?: string;
}

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

function channelsFromBlock(block: ArenaBlock): ArenaChannelInfo[] {
  const out: ArenaChannelInfo[] = [];
  const seen = new Set<string>();
  for (const c of block.channels ?? []) {
    if (!c) continue;
    const id = c.id != null ? String(c.id) : undefined;
    const key = id ?? c.slug ?? c.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry: ArenaChannelInfo = {};
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

export type ArenaCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: string };

// Fetches a single Are.na block by source id and shapes it into the
// universal `Capture`. Used by the URL-first pipeline extractor; the
// list-refresh path (`harvestArenaListViaApi`) only needs sourceId+url
// per entry and is wired separately.
export async function fetchArenaCapture(args: {
  sourceId: string;
}): Promise<ArenaCaptureResult> {
  const fetched = await fetchArenaBlock(args.sourceId);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const block = fetched.value;
  const id = block.id != null ? String(block.id) : null;
  if (!id) return { ok: false, reason: "no_match" };

  const arenaUrl = `https://www.are.na/block/${id}`;

  const title =
    pickNonEmpty(block.title) ?? pickNonEmpty(block.generated_title);

  const description =
    pickNonEmpty(block.description) ?? pickNonEmpty(block.content);

  const author = (() => {
    const u = block.user ?? {};
    const name = pickNonEmpty(u.full_name);
    const slug = pickNonEmpty(u.slug);
    const avatarUrl =
      pickNonEmpty(u.avatar_image?.thumb) ??
      pickNonEmpty(u.avatar_image?.display) ??
      pickNonEmpty(u.avatar);
    const out: NonNullable<Capture["author"]> = {};
    if (name) out.name = name;
    if (slug) {
      out.handle = slug;
      out.profileUrl = `https://www.are.na/${slug}`;
    }
    if (avatarUrl) out.avatarUrl = avatarUrl;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const media = ((): CaptureMedia[] => {
    const picked = pickMediaUrlAndDims(block);
    if (!picked.url) return [];
    const entry: CaptureMedia = {
      url: picked.url,
      type: picked.type === "video" ? "video" : "image",
    };
    if (picked.width != null) entry.width = picked.width;
    if (picked.height != null) entry.height = picked.height;
    if (picked.poster && picked.type === "video")
      entry.posterUrl = picked.poster;
    return [entry];
  })();

  const metrics = ((): CaptureMetrics | undefined => {
    const out: CaptureMetrics = {};
    const connFromObj = block.connections?.count;
    const connFromCount = block.connections_count;
    if (typeof connFromObj === "number") out.connections = connFromObj;
    else if (typeof connFromCount === "number") out.connections = connFromCount;
    if (typeof block.comment_count === "number")
      out.comments = block.comment_count;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  // Upstream: prefer the embed (iframe target — YouTube/Vimeo/etc.),
  // then the attachment, then the original `source.url`. The first one
  // that parses as a valid URL wins. yt-dlp targets this host rather
  // than the are.na permalink for video blocks.
  const upstream = ((): Capture["upstream"] => {
    const candidates = [
      pickNonEmpty(block.embed?.url),
      pickNonEmpty(block.attachment?.url),
      pickNonEmpty(block.source?.url),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return { url: candidate, host: new URL(candidate).host };
      } catch {
        // try next candidate
      }
    }
    return undefined;
  })();

  const channels = channelsFromBlock(block);
  const extras = ((): Record<string, unknown> | undefined => {
    const out: Record<string, unknown> = {};
    if (typeof block.class === "string") out.blockClass = block.class;
    if (channels.length > 0) out.channels = channels;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  // The block's outward URL is the upstream `source.url` when present
  // (so video embeds route to the real host), otherwise the are.na
  // permalink.
  const url =
    typeof block.source?.url === "string" && block.source.url
      ? block.source.url
      : arenaUrl;

  const capture: Capture = {
    id,
    source: "arena",
    url,
    media,
  };
  if (title) capture.title = title;
  if (description) capture.description = clampDescription(description);
  if (author) capture.author = author;
  if (block.created_at) capture.publishedAt = block.created_at;
  if (metrics) capture.metrics = metrics;
  if (upstream) capture.upstream = upstream;
  if (extras) capture.extras = extras;

  return { ok: true, capture };
}

function pickNonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

  const u = item.user ?? item.owner ?? null;
  const author =
    typeof u?.name === "string" && u.name.trim().length > 0
      ? u.name.trim()
      : typeof u?.slug === "string" && u.slug
        ? u.slug
        : undefined;

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

  // List entries flow into `enqueueSaveByUrl(entry.url)` and the
  // per-URL pipeline rebuilds the full Capture from scratch. The other
  // fields are kept for the in-flight progress UI / future use, but no
  // source-specific blob needs to ride along.
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
