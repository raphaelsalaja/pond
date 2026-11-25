import type { JsonObject, JsonValue } from "@pond/schema/json";
import type {
  Capture,
  CaptureExtras,
  CaptureMedia,
  CaptureMetrics,
} from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { browserUserAgent } from "../../harvest-window/constants";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 PondBot/0.1";
const FETCH_TIMEOUT_MS = 15_000;

const OptionalText = z.string().optional().catch(undefined);
const OptionalCount = z.number().optional().catch(undefined);

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const RelayUserSchema = z
  .object({
    fullName: OptionalText,
    username: OptionalText,
    profileUrl: OptionalText,
    imageLargeUrl: OptionalText,
    imageMediumUrl: OptionalText,
    imageSmallUrl: OptionalText,
  })
  .optional()
  .catch(undefined);

type RelayUser = NonNullable<z.infer<typeof RelayUserSchema>>;

const RelayImageSchema = z
  .object({ url: OptionalText, width: OptionalCount, height: OptionalCount })
  .optional()
  .catch(undefined);

const RelayPinSchema = z
  .object({
    title: OptionalText,
    closeupUnifiedTitle: OptionalText,
    description: OptionalText,
    closeupUnifiedDescription: OptionalText,
    seoTitle: OptionalText,
    dominantColor: OptionalText,
    imageLargeUrl: OptionalText,
    createdAt: OptionalText,
    repinCount: OptionalCount,
    totalReactionCount: OptionalCount,
    shareCount: OptionalCount,
    isVideo: z.boolean().optional().catch(undefined),
    link: OptionalText,
    mobileLink: OptionalText,
    closeupAttribution: RelayUserSchema,
    closeupUnifiedAttribution: RelayUserSchema,
    nativeCreator: RelayUserSchema,
    originPinner: RelayUserSchema,
    board: z.object({ url: OptionalText }).optional().catch(undefined),
    images_orig: RelayImageSchema,
    images_736x: RelayImageSchema,
    images_564x: RelayImageSchema,
    images_474x: RelayImageSchema,
    images: z
      .record(z.string(), z.object({ url: OptionalText }).catch({}))
      .optional()
      .catch(undefined),
    videos: z
      .object({
        video_list: z
          .record(z.string(), z.object({ url: OptionalText }).catch({}))
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    storyPinData: JsonValueSchema.optional().catch(undefined),
    aggregatedPinData: z
      .object({
        aggregatedStats: z
          .object({ saves: OptionalCount })
          .optional()
          .catch(undefined),
        commentCount: OptionalCount,
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

type RelayPin = z.infer<typeof RelayPinSchema>;

const JsonObjectSchema = z.custom<JsonObject>(
  (value) => Object(value) === value && !Array.isArray(value),
);

const RelayEnvelopeSchema = z
  .object({
    data: z
      .object({
        v3GetPinQueryv2: z
          .object({
            __typename: OptionalText,
            data: JsonObjectSchema.optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export type PinterestCaptureResult =
  | { ok: true; capture: Capture }
  | {
      ok: false;
      reason: "fetch_failed" | "blocked" | "no_pin" | "not_found";
      status?: number;
    };

/** One GET of pin HTML, so tests can answer for the network. */
export type PinterestGet = (url: string) => Promise<Response>;

const PIN_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

function pinHeaders(userAgent: string) {
  return {
    "user-agent": userAgent,
    accept: PIN_ACCEPT,
    "accept-language": "en-US,en;q=0.9",
  };
}

const anonymousGet: PinterestGet = (url) =>
  fetch(url, {
    redirect: "follow",
    headers: pinHeaders(USER_AGENT),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

export function pinterestSessionGet(partition: string): PinterestGet {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return (url) =>
    ses.fetch(url, {
      redirect: "follow",
      headers: pinHeaders(ua),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
}

export async function fetchPinterestCapture({
  sourceId,
  get = anonymousGet,
}: {
  sourceId: string;
  get?: PinterestGet;
}): Promise<PinterestCaptureResult> {
  const url = `https://www.pinterest.com/pin/${sourceId}/`;
  let res: Response;
  try {
    res = await get(url);
  } catch (error) {
    log.warn("[pond refresh:pinterest-api] fetch failed", url, error);
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
  const page = parsePinPage(await res.text());
  if (page.kind !== "pin") return { ok: false, reason: page.kind };
  return { ok: true, capture: buildCapture(sourceId, url, page.pin) };
}

type PinPage =
  | { kind: "pin"; pin: RelayPin }
  | { kind: "not_found" }
  | { kind: "no_pin" };

/** Logged-out HTML reports `PinNotFound` for secret, group, idea, and video pins that still exist. */
export function parsePinPage(html: string): PinPage {
  const candidates: Array<JsonObject> = [];
  let notFound = false;
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
        const envelope = RelayEnvelopeSchema.parse(JSON.parse(jsonStr));
        const query = envelope.data?.v3GetPinQueryv2;
        if (query?.data) {
          candidates.push(query.data);
        }
        if (query?.__typename === "PinNotFound") {
          notFound = true;
        }
      } catch {
        /** A relay call whose payload isn't JSON carries no pin. */
      }
    }
    cursor = callEnd + 1;
  }
  if (candidates.length > 0) {
    return { kind: "pin", pin: RelayPinSchema.parse(mergePins(candidates)) };
  }
  return { kind: notFound ? "not_found" : "no_pin" };
}

function mergePins(pins: Array<JsonObject>): JsonObject {
  const out: JsonObject = {};
  const keys = new Set<string>();
  for (const p of pins) {
    for (const k of Object.keys(p)) keys.add(k);
  }
  for (const key of keys) {
    let best: JsonValue | undefined;
    let bestScore = -1;
    for (const p of pins) {
      const v = p[key];
      if (v === null || v === undefined) {
        continue;
      }
      const score =
        Object(v) === v && !Array.isArray(v) ? Object.keys(v).length : 1;
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    if (best !== undefined) out[key] = best;
  }
  return out;
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
    if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      _depthBrace += 1;
    } else if (c === "}") {
      _depthBrace -= 1;
    } else if (c === "(") {
      depthParen += 1;
    } else if (c === ")") {
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
    if (c === '"') {
      inStr = true;
    } else if (c === "(") {
      depthParen += 1;
    } else if (c === ")") {
      depthParen -= 1;
    } else if (c === "{") {
      if (depthParen === 0 && depthBrace === 0) {
        return i;
      }
      depthBrace += 1;
    } else if (c === "}") {
      depthBrace -= 1;
    }
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

  const media = mediaFromPin(pin);

  const metrics = ((): CaptureMetrics | undefined => {
    const out: CaptureMetrics = {};
    const aggregated = pin.aggregatedPinData;
    if (pin.totalReactionCount !== undefined) {
      out.reactions = pin.totalReactionCount;
    }
    if (aggregated?.commentCount !== undefined) {
      out.comments = aggregated.commentCount;
    }
    if (aggregated?.aggregatedStats?.saves !== undefined) {
      out.saves = aggregated.aggregatedStats.saves;
    }
    if (pin.repinCount !== undefined) out.repins = pin.repinCount;
    if (pin.shareCount !== undefined) out.shares = pin.shareCount;
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const extras = ((): CaptureExtras | undefined => {
    const out: CaptureExtras = {};
    const externalLink = pickStr([pin.link, pin.mobileLink]);
    if (externalLink) out.externalLink = externalLink;
    if (pin.dominantColor) out.dominantColor = pin.dominantColor;
    if (pin.board?.url) {
      const boardUrl = pin.board.url.startsWith("http")
        ? pin.board.url
        : `https://www.pinterest.com${pin.board.url}`;
      const slug = pin.board.url.replace(/\/+$/, "").split("/").pop();
      const boardName = slug
        ? decodeURIComponent(slug).replaceAll("-", " ")
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

/** Video, story, idea, and product pins often omit `images_orig`. */
function mediaFromPin(pin: RelayPin): Array<CaptureMedia> {
  const still = pickStr([
    pin.images_orig?.url,
    pin.images?.orig?.url,
    pin.imageLargeUrl,
    pin.images_736x?.url,
    pin.images?.["736x"]?.url,
    pin.images_564x?.url,
    pin.images_474x?.url,
    ...httpUrls(pin.storyPinData).filter(
      (url) => /pinimg\.com/i.test(url) && !/\.mp4(?:$|\?)/i.test(url),
    ),
  ]);
  const video = pickStr([
    ...videoListUrls(pin.videos?.video_list),
    ...httpUrls(pin.storyPinData).filter((url) => /\.mp4(?:$|\?)/i.test(url)),
  ]);
  const url = video ?? still;
  if (!url) return [];
  const dims = pin.images_736x ?? pin.images_564x ?? pin.images_474x;
  const entry: CaptureMedia = {
    url,
    type: video ? "video" : "image",
  };
  if (video && still) entry.posterUrl = still;
  if (!video && dims?.width !== undefined) entry.width = dims.width;
  if (!video && dims?.height !== undefined) entry.height = dims.height;
  return [entry];
}

function videoListUrls(
  list: Record<string, { url?: string }> | undefined,
): Array<string> {
  if (!list) {
    return [];
  }
  const preferred = pickStr(
    ["V_720P", "V_EXP7", "V_HLSV3_MOBILE"].map((key) => list[key]?.url),
  );
  if (preferred) return [preferred];
  return Object.values(list).flatMap((item) => (item.url ? [item.url] : []));
}

function httpUrls(value: JsonValue | undefined): Array<string> {
  if (value === undefined) {
    return [];
  }
  const text = z.string().safeParse(value);
  if (text.success) {
    return /^https?:\/\//.test(text.data) ? [text.data] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(httpUrls);
  }
  const record = JsonObjectSchema.safeParse(value);
  if (record.success) {
    return Object.values(record.data).flatMap(httpUrls);
  }
  return [];
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
    if (v?.trim()) return v.trim();
  }
  return null;
}
