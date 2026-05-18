import type { Capture, CaptureMedia, CaptureMetrics } from "@pond/schema/raw";
import log from "electron-log/main.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 PondBot/0.1";
const FETCH_TIMEOUT_MS = 15_000;

// Pinterest server-renders the full pin payload as a Relay response:
//   <script>window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__(
//     "<url-encoded descriptor>",
//     {"data":{"v3GetPinQueryv2":{"data": <pin>}}}
//   )</script>
// We grab that JSON directly — it has the clean title, creator name, full
// resolution image URL, dominant color, etc. — none of which OG meta exposes.

interface RelayUser {
  fullName?: string;
  firstName?: string;
  username?: string;
  websiteUrl?: string;
  profileUrl?: string;
  imageLargeUrl?: string;
  imageMediumUrl?: string;
  imageSmallUrl?: string;
  id?: string;
  entityId?: string;
}

interface RelayImage {
  url?: string;
  width?: number;
  height?: number;
}

interface RelayPin {
  title?: string;
  closeupUnifiedTitle?: string;
  description?: string;
  closeupUnifiedDescription?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoAltText?: string;
  dominantColor?: string;
  imageLargeUrl?: string;
  imageSignature?: string;
  createdAt?: string;
  repinCount?: number;
  favoriteUserCount?: number;
  totalReactionCount?: number;
  shareCount?: number;
  isVideo?: boolean;
  domain?: string;
  link?: string;
  mobileLink?: string;
  priceCurrency?: string;
  closeupAttribution?: RelayUser;
  closeupUnifiedAttribution?: RelayUser;
  nativeCreator?: RelayUser;
  originPinner?: RelayUser;
  pinner?: RelayUser & { domainUrl?: string };
  board?: { url?: string };
  images_orig?: RelayImage;
  images_736x?: RelayImage;
  images_564x?: RelayImage;
  images_474x?: RelayImage;
  images_236x?: RelayImage;
  aggregatedPinData?: {
    aggregatedStats?: { saves?: number };
    commentCount?: number;
  };
  pinJoin?: {
    visualAnnotation?: string[];
    seoBreadcrumbs?: Array<{ name?: string; url?: string }>;
    seoCanonicalUrl?: string;
    seoCanonicalDomain?: string;
    canonicalPin?: { entityId?: string; id?: string };
  };
  storyPinData?: {
    totalVideoDuration?: number;
    metadata?: { pinTitle?: string };
    pages?: Array<unknown>;
  };
}

export type PinterestCaptureResult =
  | { ok: true; capture: Capture }
  | {
      ok: false;
      reason: "fetch_failed" | "blocked" | "no_pin";
      status?: number;
    };

// Scrapes the Pinterest Relay payload (which holds the full title,
// creator avatar, full-resolution image URL, and metrics that aren't
// in OG tags) and reshapes it into a universal `Capture`.
export async function fetchPinterestCapture({
  sourceId,
}: {
  sourceId: string;
}): Promise<PinterestCaptureResult> {
  const url = `https://www.pinterest.com/pin/${sourceId}/`;
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn("[pond refresh:pinterest-api] fetch failed", url, err);
    return { ok: false, reason: "fetch_failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason:
        res.status === 401 || res.status === 403 ? "blocked" : "fetch_failed",
      status: res.status,
    };
  }
  const html = await res.text();
  const pin = extractPin(html);
  if (!pin) return { ok: false, reason: "no_pin" };
  return { ok: true, capture: buildCapture(sourceId, url, pin) };
}

function extractPin(html: string): RelayPin | null {
  // Pinterest emits several Relay calls per page. The first usually has the
  // pin's content fields (title, image, attribution stub) but a stripped
  // creator object; later calls return the full creator with avatar URLs.
  // We collect every payload and merge — for each key, prefer the richest
  // value (most keys for nested objects, first non-empty for scalars).
  const candidates: RelayPin[] = [];
  const callOpen = "__PWS_RELAY_REGISTER_COMPLETED_REQUEST__(";
  let cursor = 0;
  while (true) {
    const idx = html.indexOf(callOpen, cursor);
    if (idx < 0) break;
    const argStart = idx + callOpen.length;
    const callEnd = findCallEnd(html, argStart);
    if (callEnd < 0) break;
    const inner = html.slice(argStart, callEnd);
    const secondArgOffset = findSecondArgStart(inner);
    if (secondArgOffset >= 0) {
      const jsonStr = inner.slice(secondArgOffset).replace(/[\s,]+$/, "");
      try {
        const parsed = JSON.parse(jsonStr) as {
          data?: { v3GetPinQueryv2?: { data?: RelayPin } };
        };
        const candidate = parsed?.data?.v3GetPinQueryv2?.data;
        if (candidate && typeof candidate === "object") {
          candidates.push(candidate);
        }
      } catch {
        // try next call
      }
    }
    cursor = callEnd + 1;
  }
  if (candidates.length === 0) return null;
  return mergePins(candidates);
}

function mergePins(pins: RelayPin[]): RelayPin {
  const out: Record<string, unknown> = {};
  const keys = new Set<string>();
  for (const p of pins) {
    for (const k of Object.keys(p)) keys.add(k);
  }
  for (const key of keys) {
    let best: unknown;
    let bestScore = -1;
    for (const p of pins) {
      const v = (p as Record<string, unknown>)[key];
      if (v == null) continue;
      const score =
        typeof v === "object" && !Array.isArray(v)
          ? Object.keys(v as Record<string, unknown>).length
          : 1;
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    if (best !== undefined) out[key] = best;
  }
  return out as RelayPin;
}

function findCallEnd(s: string, start: number): number {
  let depthParen = 1;
  let _depthBrace = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") _depthBrace += 1;
    else if (c === "}") _depthBrace -= 1;
    else if (c === "(") depthParen += 1;
    else if (c === ")") {
      depthParen -= 1;
      if (depthParen === 0) return i;
    }
  }
  return -1;
}

function findSecondArgStart(inner: string): number {
  let depthParen = 0;
  let depthBrace = 0;
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "(") depthParen += 1;
    else if (c === ")") depthParen -= 1;
    else if (c === "{") {
      if (depthParen === 0 && depthBrace === 0) return i;
      depthBrace += 1;
    } else if (c === "}") depthBrace -= 1;
  }
  return -1;
}

function buildCapture(sourceId: string, url: string, pin: RelayPin): Capture {
  const title = pickStr([
    pin.title,
    pin.closeupUnifiedTitle,
    cleanSeoTitle(pin.seoTitle),
  ]);
  const description = pickDescription(pin);

  // Prefer richer creator objects first; the merged Relay result usually
  // puts the full user in nativeCreator / closeupUnifiedAttribution /
  // originPinner.
  const creator = pickCreator(pin);
  const author = ((): Capture["author"] => {
    if (!creator) return undefined;
    const name = creator.fullName ?? undefined;
    const handle = creator.username ?? undefined;
    const avatarUrl =
      pickStr([
        creator.imageLargeUrl,
        creator.imageMediumUrl,
        creator.imageSmallUrl,
      ]) ?? undefined;
    const profileUrl =
      creator.profileUrl ??
      (creator.username
        ? `https://www.pinterest.com/${creator.username}/`
        : undefined);
    const out: NonNullable<Capture["author"]> = {};
    if (name) out.name = name;
    if (handle) out.handle = handle;
    if (avatarUrl) out.avatarUrl = avatarUrl;
    if (profileUrl) out.profileUrl = profileUrl;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const media = ((): CaptureMedia[] => {
    const primary = pickStr([pin.images_orig?.url, pin.imageLargeUrl]);
    if (!primary) return [];
    // The 736x variant carries width/height; the originals URL doesn't
    // expose dimensions in the GraphQL response but shares the same
    // aspect ratio, so we reuse those dims as a hint for the cover.
    const dims = pin.images_736x ?? pin.images_564x ?? pin.images_474x;
    const entry: CaptureMedia = {
      url: primary,
      type: pin.isVideo ? "video" : "image",
    };
    if (typeof dims?.width === "number") entry.width = dims.width;
    if (typeof dims?.height === "number") entry.height = dims.height;
    return [entry];
  })();

  const metrics = ((): CaptureMetrics | undefined => {
    const out: CaptureMetrics = {};
    if (typeof pin.totalReactionCount === "number") {
      out.reactions = pin.totalReactionCount;
    }
    if (typeof pin.aggregatedPinData?.commentCount === "number") {
      out.comments = pin.aggregatedPinData.commentCount;
    }
    if (typeof pin.aggregatedPinData?.aggregatedStats?.saves === "number") {
      out.saves = pin.aggregatedPinData.aggregatedStats.saves;
    }
    if (typeof pin.repinCount === "number") out.repins = pin.repinCount;
    if (typeof pin.shareCount === "number") out.shares = pin.shareCount;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const extras = ((): Record<string, unknown> | undefined => {
    const out: Record<string, unknown> = {};
    const externalLink = pickStr([pin.link, pin.mobileLink]);
    if (externalLink) out.externalLink = externalLink;
    if (pin.dominantColor) out.dominantColor = pin.dominantColor;
    if (pin.board?.url) {
      const boardUrl = pin.board.url.startsWith("http")
        ? pin.board.url
        : `https://www.pinterest.com${pin.board.url}`;
      const slug = pin.board.url.replace(/\/+$/, "").split("/").pop();
      const boardName = slug
        ? decodeURIComponent(slug).replace(/-/g, " ")
        : undefined;
      out.board = { name: boardName, url: boardUrl };
    }
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const publishedAt = parsePinterestDate(pin.createdAt);

  const capture: Capture = {
    id: sourceId,
    source: "pinterest",
    url,
    media,
  };
  if (title) capture.title = title;
  if (description) capture.description = description;
  if (author) capture.author = author;
  if (publishedAt) capture.publishedAt = publishedAt;
  if (metrics) capture.metrics = metrics;
  if (extras) capture.extras = extras;
  return capture;
}

function parsePinterestDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function pickCreator(pin: RelayPin): RelayUser | null {
  const candidates: Array<RelayUser | undefined> = [
    pin.nativeCreator,
    pin.closeupUnifiedAttribution,
    pin.originPinner,
    pin.closeupAttribution,
  ];
  let best: RelayUser | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (!c) continue;
    const score =
      (c.fullName ? 2 : 0) +
      (c.imageLargeUrl ? 3 : c.imageMediumUrl ? 2 : c.imageSmallUrl ? 1 : 0) +
      (c.username ? 1 : 0);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function cleanSeoTitle(seoTitle: string | undefined): string | null {
  if (!seoTitle) return null;
  const head = seoTitle.split(/\s+\|\s+/)[0]?.trim();
  return head && head.length >= 3 ? head : seoTitle;
}

function pickDescription(pin: RelayPin): string | null {
  for (const c of [pin.description, pin.closeupUnifiedDescription]) {
    const t = (c ?? "").trim();
    if (t.length >= 3) return t;
  }
  return null;
}

function pickStr(values: Array<string | undefined | null>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
