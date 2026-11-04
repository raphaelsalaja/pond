import { setTimeout as delay } from "node:timers/promises";
import type { MediaType } from "@pond/schema/db";
import type { Capture, CaptureMedia, CaptureMetrics } from "@pond/schema/raw";
import { arenaLinkUrl } from "@shared/web-page-save";
import log from "electron-log/main.js";
import { z } from "zod";

interface ArenaChannelInfo {
  id?: string;
  title?: string;
  slug?: string;
  href?: string;
}

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
    await delay(wait);
  }
}

interface ArenaApiFailure {
  ok: false;
  status: number;
  reason: "not_found" | "rate_limited" | "unauthorized" | "network" | "timeout";
}

type ArenaApiResult<T> = { ok: true; value: T } | ArenaApiFailure;

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
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
    await delay(waitMs);
    return fetchJson(url, schema, attempt + 1);
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
    return { ok: true, value: schema.parse(await res.json()) };
  } catch (err) {
    log.warn("[pond arena:api] bad json", url, err);
    return { ok: false, status: res.status, reason: "network" };
  }
}

const OptionalText = z.string().optional().catch(undefined);
const OptionalCount = z.number().optional().catch(undefined);
const OptionalIdentifier = z
  .union([z.number(), z.string()])
  .optional()
  .catch(undefined);

const ArenaImageVariantSchema = z
  .object({ url: OptionalText })
  .optional()
  .catch(undefined);

const ArenaChannelLiteSchema = z
  .object({
    id: OptionalIdentifier,
    title: OptionalText,
    slug: OptionalText,
    href: OptionalText,
  })
  .nullable()
  .catch(null);

const ArenaBlockSchema = z
  .object({
    id: OptionalIdentifier,
    class: OptionalText,
    title: OptionalText,
    generated_title: OptionalText,
    description: OptionalText,
    content: OptionalText,
    created_at: OptionalText,
    image: z
      .object({
        original: z
          .object({
            url: OptionalText,
            width: OptionalCount,
            height: OptionalCount,
          })
          .optional()
          .catch(undefined),
        large: ArenaImageVariantSchema,
        display: ArenaImageVariantSchema,
        thumb: ArenaImageVariantSchema,
      })
      .optional()
      .catch(undefined),
    user: z
      .object({
        full_name: OptionalText,
        slug: OptionalText,
        avatar: OptionalText,
        avatar_image: z
          .object({ thumb: OptionalText, display: OptionalText })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    source: z.object({ url: OptionalText }).optional().catch(undefined),
    attachment: z.object({ url: OptionalText }).optional().catch(undefined),
    embed: z.object({ url: OptionalText }).optional().catch(undefined),
    connections: z.object({ count: OptionalCount }).optional().catch(undefined),
    connections_count: OptionalCount,
    comment_count: OptionalCount,
    channels: z.array(ArenaChannelLiteSchema).optional().catch(undefined),
  })
  .catch({});

export type ArenaBlock = z.infer<typeof ArenaBlockSchema>;

function fetchArenaBlock(blockId: string): Promise<ArenaApiResult<ArenaBlock>> {
  const url = `${API_BASE}/blocks/${encodeURIComponent(blockId)}`;
  return fetchJson(url, ArenaBlockSchema);
}

interface ArenaPickedMedia {
  url: string | null;
  width: number | null;
  height: number | null;
  type: MediaType;
  poster: string | null;
  embedUrl: string | null;
  attachmentUrl: string | null;
}

function pickMediaUrlAndDims(block: ArenaBlock): ArenaPickedMedia {
  const original = block.image?.original ?? null;
  const originalUrl = original?.url ?? null;
  const largeUrl = block.image?.large?.url ?? null;
  const displayUrl = block.image?.display?.url ?? null;
  const thumbUrl = block.image?.thumb?.url ?? null;
  const cls = (block.class ?? "").toLowerCase();

  const poster = originalUrl ?? largeUrl ?? displayUrl ?? thumbUrl ?? null;
  const width = original?.width ?? null;
  const height = original?.height ?? null;

  if (cls === "media") {
    const embedUrl = block.embed?.url ?? null;
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
    if (c.title !== undefined) entry.title = c.title;
    if (c.slug !== undefined) entry.slug = c.slug;
    if (c.href !== undefined) entry.href = c.href;
    if (Object.keys(entry).length > 0) out.push(entry);
  }
  return out;
}

function clampDescription(value: string): string {
  return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
}

type ArenaExtras = {
  blockClass?: string;
  channels?: ArenaChannelInfo[];
};

type ArenaCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: string };

interface ArenaCaptureDeps {
  fetchBlock: (blockId: string) => Promise<ArenaApiResult<ArenaBlock>>;
  extractPage: (url: URL, signal?: AbortSignal) => Promise<Capture>;
}

async function extractWebPage(
  url: URL,
  signal?: AbortSignal,
): Promise<Capture> {
  const { WebPageExtractor } = await import(
    "../../../pipeline/extractors/sources/web"
  );
  return new WebPageExtractor().extract({ url, signal });
}

const defaultDeps: ArenaCaptureDeps = {
  fetchBlock: fetchArenaBlock,
  extractPage: extractWebPage,
};

export async function fetchArenaCapture(
  args: { sourceId: string; signal?: AbortSignal },
  deps: ArenaCaptureDeps = defaultDeps,
): Promise<ArenaCaptureResult> {
  const fetched = await deps.fetchBlock(args.sourceId);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const capture = captureFromBlock(fetched.value);
  if (!capture) return { ok: false, reason: "no_match" };

  const linkUrl = arenaLinkUrl(capture);
  if (!linkUrl) return { ok: true, capture };
  try {
    const page = await deps.extractPage(new URL(linkUrl), args.signal);
    return { ok: true, capture: withLinkedPage(capture, page) };
  } catch (err) {
    args.signal?.throwIfAborted();
    log.info(
      "[pond arena:api] linked page unavailable, keeping block preview",
      linkUrl,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: true, capture };
  }
}

/** Block fields win because you may have edited them on Are.na; the page fills what the block lacks. */
function withLinkedPage(block: Capture, page: Capture): Capture {
  const merged: Capture = {
    ...block,
    media: linkedPageMedia(block, page),
    extras: { ...page.extras, ...block.extras },
  };
  const title = block.title ?? page.title;
  if (title) merged.title = title;
  const description = block.description ?? page.description;
  if (description) merged.description = clampDescription(description);
  const author = block.author ?? page.author;
  if (author) merged.author = author;
  const publishedAt = block.publishedAt ?? page.publishedAt;
  if (publishedAt) merged.publishedAt = publishedAt;
  return merged;
}

/** A page without a cover image falls back to its favicon; Are.na's screenshot of the page shows more. */
function linkedPageMedia(block: Capture, page: Capture): CaptureMedia[] {
  const cover = page.media[0];
  if (cover && cover.url !== page.extras?.faviconUrl) return page.media;
  return block.media.length > 0 ? block.media : page.media;
}

function captureFromBlock(block: ArenaBlock): Capture | null {
  const id = block.id != null ? String(block.id) : null;
  if (!id) return null;

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
    if (connFromObj !== undefined) out.connections = connFromObj;
    else if (connFromCount !== undefined) out.connections = connFromCount;
    if (block.comment_count !== undefined) out.comments = block.comment_count;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

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
      } catch {}
    }
    return undefined;
  })();

  const channels = channelsFromBlock(block);
  const extras = ((): ArenaExtras | undefined => {
    const out: ArenaExtras = {};
    if (block.class !== undefined) out.blockClass = block.class;
    if (channels.length > 0) out.channels = channels;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const url = block.source?.url || arenaUrl;

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

  return capture;
}

function pickNonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
