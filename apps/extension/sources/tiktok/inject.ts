import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { asNumber, asText, isRecord, parseJsonValue } from "@/utils/json";
import type { JsonValue } from "@/utils/json";

/** Match the favorite/collect verb at the end of any /api/ path so prefix reshuffles keep matching. */
const FAVORITE_RE = /\/api\/(?:[a-z_]+\/)*(?:favorite|collect)\/?(?:\?|$)/i;
/** TikTok likes POST to /digg. */
const DIGG_RE = /\/api\/(?:[a-z_]+\/)*digg\/?(?:\?|$)/i;
/** Feed/detail payloads that carry author handles; TikTok reshuffles these often and uses POST as well as GET. */
const FEED_RE =
  /\/api\/(?:[a-z_]+\/)*(?:aweme|item|feed|post|recommend|detail|list)/i;

const ID_KEYS = ["aweme_id", "awemeId", "item_id", "itemId"] as const;

function awemeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url, location.href);
    for (const key of ID_KEYS) {
      const v = u.searchParams.get(key);
      if (v) return v;
    }
    return null;
  } catch {
    return null;
  }
}

/** Newer endpoints send the id in the POST body rather than the query string. */
async function awemeIdFromBody(req: RequestLens): Promise<string | null> {
  let body: string | null;
  try {
    body = await req.readBody();
  } catch {
    return null;
  }
  if (!body) return null;
  try {
    const params = new URLSearchParams(body);
    for (const key of ID_KEYS) {
      const v = params.get(key);
      if (v) return v;
    }
  } catch {
    /* not form-encoded */
  }
  const json = parseJsonValue(body);
  if (isRecord(json)) {
    for (const key of ID_KEYS) {
      const text = asText(json[key]);
      if (text) return text;
      const numeric = asNumber(json[key]);
      if (numeric !== undefined) return String(numeric);
    }
  }
  return null;
}

function isFavoriteType(url: string): boolean {
  try {
    /** type=1 adds, type=0 removes; absent on endpoints that don't use it. */
    const t = new URL(url, location.href).searchParams.get("type");
    return t === "1" || t === null;
  } catch {
    return true;
  }
}

function usernameFromLocation(): string | null {
  try {
    const m = location.pathname.match(/^\/@([^/]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** FYP and related surfaces keep `/@handle/video/{id}` links even when the location bar does not. */
function usernameFromDom(id: string): string | null {
  try {
    const needle = `/video/${id}`;
    const anchors = document.querySelectorAll<HTMLAnchorElement>(
      `a[href*="${needle}"]`,
    );
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? a.href;
      const m = href.match(/\/@([^/]+)\/video\/\d+/);
      if (m?.[1]) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function inject(): void {
  const usernameByAwemeId = new Map<string, string>();
  const emitted = new Set<string>();

  function walkForAweme(node: JsonValue): void {
    if (Array.isArray(node)) {
      for (const child of node) walkForAweme(child);
      return;
    }
    if (!isRecord(node)) return;
    const id = node.aweme_id ?? node.awemeId ?? node.id;
    const author = node.author;
    if (id && isRecord(author)) {
      const handle = asText(
        author.unique_id ?? author.uniqueId ?? author.handle,
      );
      if (handle) usernameByAwemeId.set(String(id), handle);
    }
    for (const child of Object.values(node)) walkForAweme(child);
  }

  function emitVideo(id: string, trigger: string): void {
    if (!id || emitted.has(id)) return;
    emitted.add(id);
    const fromCache = usernameByAwemeId.get(id) ?? null;
    const fromDom = fromCache ? null : usernameFromDom(id);
    const fromLocation = fromCache || fromDom ? null : usernameFromLocation();
    const username = fromCache ?? fromDom ?? fromLocation;
    const url = username
      ? `https://www.tiktok.com/@${username}/video/${id}`
      : `https://www.tiktok.com/video/${id}`;
    capture(url, trigger);
  }

  installInterceptor({
    id: "tiktok",
    match: (req: RequestLens) =>
      FAVORITE_RE.test(req.url) ||
      DIGG_RE.test(req.url) ||
      FEED_RE.test(req.url),
    async onResponse(req, res) {
      if (!res.ok) return;
      if (DIGG_RE.test(req.url) && isFavoriteType(req.url)) {
        const id = awemeIdFromUrl(req.url) ?? (await awemeIdFromBody(req));
        if (id) {
          walkForAweme(parseJsonValue(await res.readText()));
          emitVideo(id, "tiktok:like");
        }
        return;
      }
      if (FAVORITE_RE.test(req.url) && isFavoriteType(req.url)) {
        const id = awemeIdFromUrl(req.url) ?? (await awemeIdFromBody(req));
        if (id) {
          walkForAweme(parseJsonValue(await res.readText()));
          emitVideo(id, "tiktok:favorite");
        }
        return;
      }
      if (FEED_RE.test(req.url)) {
        walkForAweme(parseJsonValue(await res.readText()));
      }
    },
  });
}
