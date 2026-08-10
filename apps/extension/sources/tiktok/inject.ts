import {
  capture,
  installInterceptor,
  log,
  type RequestLens,
} from "@/utils/intercept";

/** Match the favorite/collect verb at the end of any /api/ path so prefix reshuffles keep matching; likes ("digg") are excluded. */
const FAVORITE_RE = /\/api\/(?:[a-z_]+\/)*(?:favorite|collect)\/?(?:\?|$)/i;
/** Feed/detail payloads that carry author handles; TikTok reshuffles these often and uses POST as well as GET. */
const FEED_RE =
  /\/api\/(?:[a-z_]+\/)*(?:aweme|item|feed|post|recommend|detail|list)/i;

function readJson(text: string | null): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
  const json = readJson(body);
  if (json && typeof json === "object") {
    for (const key of ID_KEYS) {
      const v = (json as Record<string, unknown>)[key];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
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

  function walkForAweme(obj: any): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) walkForAweme(x);
      return;
    }
    const id = obj.aweme_id ?? obj.awemeId ?? obj.id;
    if (id && obj.author) {
      const username =
        obj.author.unique_id ??
        obj.author.uniqueId ??
        obj.author.handle ??
        null;
      if (typeof username === "string" && username.length > 0) {
        usernameByAwemeId.set(String(id), username);
      }
    }
    for (const k of Object.keys(obj)) {
      try {
        walkForAweme(obj[k]);
      } catch {
        /* ignore */
      }
    }
  }

  function emitFavorite(id: string): void {
    if (!id || emitted.has(id)) return;
    emitted.add(id);
    const fromCache = usernameByAwemeId.get(id) ?? null;
    const fromDom = fromCache ? null : usernameFromDom(id);
    const fromLocation = fromCache || fromDom ? null : usernameFromLocation();
    const username = fromCache ?? fromDom ?? fromLocation;
    const url = username
      ? `https://www.tiktok.com/@${username}/video/${id}`
      : `https://www.tiktok.com/video/${id}`;
    // #region agent log
    log("info", "tiktok emitFavorite", {
      id,
      hasUsername: Boolean(username),
      source: fromCache
        ? "cache"
        : fromDom
          ? "dom"
          : fromLocation
            ? "location"
            : "none",
      url,
      cacheSize: usernameByAwemeId.size,
    });
    fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "384c19",
      },
      body: JSON.stringify({
        sessionId: "384c19",
        runId: "post-fix",
        hypothesisId: "F",
        location: "tiktok/inject.ts:emitFavorite",
        message: "tiktok emitFavorite",
        data: {
          id,
          hasUsername: Boolean(username),
          source: fromCache
            ? "cache"
            : fromDom
              ? "dom"
              : fromLocation
                ? "location"
                : "none",
          url,
          cacheSize: usernameByAwemeId.size,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    capture(url, "tiktok:favorite");
  }

  installInterceptor({
    id: "tiktok",
    match: (req: RequestLens) =>
      FAVORITE_RE.test(req.url) || FEED_RE.test(req.url),
    async onResponse(req, res) {
      if (!res.ok) return;
      if (FAVORITE_RE.test(req.url) && isFavoriteType(req.url)) {
        const id = awemeIdFromUrl(req.url) ?? (await awemeIdFromBody(req));
        // #region agent log
        log("info", "tiktok favorite response", {
          matched: Boolean(id),
          id,
          reqUrl: req.url.slice(0, 180),
          method: req.method,
        });
        fetch(
          "http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "384c19",
            },
            body: JSON.stringify({
              sessionId: "384c19",
              runId: "post-fix",
              hypothesisId: "C",
              location: "tiktok/inject.ts:onResponse",
              message: "tiktok favorite response",
              data: {
                matched: Boolean(id),
                id,
                reqUrl: req.url.slice(0, 180),
                method: req.method,
              },
              timestamp: Date.now(),
            }),
          },
        ).catch(() => {});
        // #endregion
        if (id) {
          walkForAweme(readJson(await res.readText()));
          emitFavorite(id);
        }
        return;
      }
      if (FEED_RE.test(req.url)) {
        walkForAweme(readJson(await res.readText()));
      }
    },
  });
}
