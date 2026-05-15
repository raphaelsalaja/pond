import type { IngestPayload } from "@pond/schema/ingest";
import log from "electron-log/main.js";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024; // 4 MiB; OG headers live in <head>

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 PondBot/0.1";

export interface OgRefreshResult {
  ok: boolean;
  payload: IngestPayload | null;
  reason?: "fetch_failed" | "non_html" | "empty" | "blocked";
  status?: number;
}

export async function refreshFromOgTags(args: {
  url: string;
  source: IngestPayload["source"];
  sourceId: string;
}): Promise<OgRefreshResult> {
  let res: Response;
  try {
    res = await fetch(args.url, {
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
    log.warn("[pond refresh:og] fetch failed", args.url, err);
    return { ok: false, payload: null, reason: "fetch_failed" };
  }

  if (!res.ok) {
    log.warn("[pond refresh:og] non-2xx", res.status, args.url);
    return {
      ok: false,
      payload: null,
      reason:
        res.status === 401 || res.status === 403 ? "blocked" : "fetch_failed",
      status: res.status,
    };
  }

  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!ctype.includes("text/html") && !ctype.includes("xhtml")) {
    return { ok: false, payload: null, reason: "non_html" };
  }

  const html = await readBoundedText(res, MAX_HTML_BYTES);
  if (!html) return { ok: false, payload: null, reason: "empty" };

  // Some sites (e.g. Pinterest) inject their og:* meta tags into the body
  // after </head> via client-side rendering. Scan the whole document for
  // meta tags; restrict to the head only for <link rel="canonical"> /
  // <html lang>/<title> lookups where head is the right scope.
  const head = sliceHead(html);
  const meta = parseMeta(html);
  const jsonLd = parseJsonLd(head);

  const rawTitle =
    pickStr([
      meta["og:title"],
      meta["twitter:title"],
      jsonLd.headline,
      jsonLd.name,
      meta.title,
      extractTagText(head, "title"),
    ]) ?? null;
  const title = rawTitle ? cleanTitle(args.source, rawTitle) : null;

  const rawDescription =
    pickStr([
      meta["og:description"],
      meta["twitter:description"],
      jsonLd.description,
      meta.description,
    ]) ?? null;
  const description = rawDescription
    ? cleanDescription(args.source, rawDescription)
    : null;

  const jsonLdAuthor =
    typeof jsonLd.author === "string"
      ? jsonLd.author
      : jsonLd.author && typeof jsonLd.author === "object"
        ? jsonLd.author.name
        : undefined;
  const jsonLdImage =
    typeof jsonLd.image === "string"
      ? jsonLd.image
      : jsonLd.image && typeof jsonLd.image === "object"
        ? jsonLd.image.url
        : undefined;

  // Pinterest's `pinterestapp:pinner` is the SAVER's profile URL, not a
  // display name — we'd be writing trash to `author`. The original creator's
  // name is not exposed in OG meta; only the hidden-window DOM scrape has it.
  const author =
    pickStr([
      meta["og:author"],
      meta["article:author"],
      jsonLdAuthor,
      meta.author,
      meta["twitter:creator"],
    ]) ?? null;

  const ogImage = pickStr([
    meta["og:image:secure_url"],
    meta["og:image"],
    meta["twitter:image"],
    jsonLdImage,
  ]);

  const ogVideo = pickStr([
    meta["og:video:secure_url"],
    meta["og:video"],
    meta["twitter:player:stream"],
  ]);

  const isVideo = Boolean(ogVideo) || meta["og:type"] === "video.other";

  const mediaUrl = upgradeMediaUrl(args.source, ogVideo ?? ogImage ?? null);

  if (!title && !description && !mediaUrl) {
    log.info("[pond refresh:og] no useful metadata", args.url);
    return { ok: false, payload: null, reason: "empty" };
  }

  const lang =
    pickStr([
      meta["og:locale"],
      meta["dc.language"],
      extractTagAttr(head, "html", "lang"),
    ]) ?? null;
  const siteName = pickStr([meta["og:site_name"], meta["application-name"]]);
  const publishedAt = pickStr([
    meta["article:published_time"],
    meta["og:article:published_time"],
    meta.datepublished,
  ]);
  const canonicalUrl = pickStr([
    extractLinkHref(head, "canonical"),
    meta["og:url"],
  ]);
  const keywords = pickStr([meta.keywords, meta.news_keywords]);

  const sourceMeta = buildSourceMeta(args.source, meta, author);

  const payload: IngestPayload = {
    source: args.source,
    sourceId: args.sourceId,
    url: args.url,
    title: title ?? undefined,
    description: description ?? undefined,
    author: author ?? undefined,
    mediaUrl: mediaUrl ?? undefined,
    mediaUrls: mediaUrl
      ? [{ url: mediaUrl, type: isVideo ? "video" : "image" }]
      : undefined,
    mediaType: mediaUrl ? (isVideo ? "video" : "image") : "link",
    raw: {
      kind: "og-refresh",
      capturedAt: new Date().toISOString(),
      og: meta,
      ...(lang ? { lang } : {}),
      ...(siteName ? { siteName } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(canonicalUrl ? { canonical: canonicalUrl } : {}),
      ...(keywords ? { keywords } : {}),
      ...(Object.keys(jsonLd).length > 0 ? { jsonLd } : {}),
      ...(sourceMeta ? { [args.source]: sourceMeta } : {}),
    },
  };

  return { ok: true, payload };
}

function cleanTitle(source: IngestPayload["source"], title: string): string {
  if (source === "pinterest") {
    // Pinterest's og:title is "{title} | {board}, {tag}, {tag}". Strip the
    // SEO suffix by taking everything before the first " | ".
    const head = title.split(/\s+\|\s+/)[0]?.trim();
    if (head && head.length >= 3) return head;
    return title.replace(/\s+\|\s+Pinterest\s*$/i, "").trim() || title;
  }
  return title;
}

const PINTEREST_BOILERPLATE_DESCRIPTION =
  /^This Pin was discovered by .+?\. Discover \(and save!\) your own Pins on Pinterest\.?$/i;

function cleanDescription(
  source: IngestPayload["source"],
  description: string,
): string | null {
  if (
    source === "pinterest" &&
    PINTEREST_BOILERPLATE_DESCRIPTION.test(description.trim())
  ) {
    return null;
  }
  return description;
}

function upgradeMediaUrl(
  source: IngestPayload["source"],
  url: string | null,
): string | null {
  if (!url) return url;
  if (source === "pinterest" && /(^|\/\/)i\.pinimg\.com\//.test(url)) {
    return url.replace(/\/\d+x(?:\d+)?\//, "/originals/");
  }
  return url;
}

function buildSourceMeta(
  source: IngestPayload["source"],
  meta: Record<string, string>,
  author: string | null,
): Record<string, unknown> | null {
  if (source !== "pinterest") return null;
  const out: Record<string, unknown> = {};
  // `pinterestapp:pinner` is the saver's profile URL; capture it as a URL,
  // do NOT use it as a display name.
  const pinnerUrl = meta["pinterestapp:pinner"];
  const boardUrl = meta["pinterestapp:pinboard"];
  const sourceUrl = meta["pinterestapp:source"];
  if (pinnerUrl) out.authorUrl = pinnerUrl;
  if (author) out.authorName = author;
  if (boardUrl) {
    out.boardUrl = boardUrl;
    const m = boardUrl.match(/\/[^/]+\/([^/]+)\/?$/);
    if (m?.[1]) out.boardName = decodeURIComponent(m[1]).replace(/-/g, " ");
  }
  if (sourceUrl) out.sourceUrl = sourceUrl;
  return Object.keys(out).length > 0 ? out : null;
}

function extractTagAttr(
  html: string,
  tag: string,
  attr: string,
): string | undefined {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (!m?.[1]) return undefined;
  return decodeEntities(m[1]).trim();
}

function extractLinkHref(html: string, rel: string): string | undefined {
  const re = new RegExp(
    `<link\\b[^>]*\\brel\\s*=\\s*["']${rel}["'][^>]*\\bhref\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const reverseRe = new RegExp(
    `<link\\b[^>]*\\bhref\\s*=\\s*["']([^"']+)["'][^>]*\\brel\\s*=\\s*["']${rel}["']`,
    "i",
  );
  const m = html.match(re) ?? html.match(reverseRe);
  if (!m?.[1]) return undefined;
  return decodeEntities(m[1]).trim();
}

async function readBoundedText(
  res: Response,
  max: number,
): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
        break;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  if (chunks.length === 0) return null;
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString("utf8");
}

function sliceHead(html: string): string {
  const start = html.search(/<head[\s>]/i);
  if (start < 0) return html.slice(0, 262_144);
  const end = html.indexOf("</head>", start);
  if (end < 0) return html.slice(start, start + 262_144);
  return html.slice(start, end + 7);
}

const META_RE =
  /<meta\b[^>]*(?:property|name|itemprop)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
const META_RE_REVERSE =
  /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*(?:property|name|itemprop)\s*=\s*["']([^"']+)["'][^>]*>/gi;

function parseMeta(head: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const re of [META_RE, META_RE_REVERSE]) {
    re.lastIndex = 0;
    let m = re.exec(head);
    while (m !== null) {
      const [keyIdx, valIdx] = re === META_RE ? [1, 2] : [2, 1];
      const key = decodeEntities(m[keyIdx]?.toLowerCase().trim() ?? "");
      const value = decodeEntities(m[valIdx] ?? "").trim();
      if (key && value && !out[key]) {
        out[key] = value;
      }
      m = re.exec(head);
    }
  }
  return out;
}

interface JsonLdShape {
  headline?: string;
  name?: string;
  description?: string;
  author?: string | { name?: string };
  image?: string | { url?: string };
}

function parseJsonLd(head: string): JsonLdShape {
  const re =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m = re.exec(head);
  while (m !== null) {
    const raw = m[1]?.trim();
    if (raw) {
      const parsed = safeParseJson(raw);
      if (parsed) {
        const cand = pickJsonLdCandidate(parsed);
        if (cand) return cand;
      }
    }
    m = re.exec(head);
  }
  return {};
}

function pickJsonLdCandidate(node: unknown): JsonLdShape | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const r = pickJsonLdCandidate(child);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const o = node as Record<string, unknown>;

  if (Array.isArray(o["@graph"])) {
    const r = pickJsonLdCandidate(o["@graph"]);
    if (r) return r;
  }

  const headline = strFromUnknown(o.headline);
  const name = strFromUnknown(o.name);
  const description = strFromUnknown(o.description);
  if (!headline && !name && !description) return null;

  let author: JsonLdShape["author"] | undefined;
  if (typeof o.author === "string") author = o.author;
  else if (Array.isArray(o.author) && o.author[0]) {
    if (typeof o.author[0] === "string") author = o.author[0];
    else if (typeof o.author[0] === "object")
      author = {
        name: strFromUnknown((o.author[0] as Record<string, unknown>).name),
      };
  } else if (o.author && typeof o.author === "object") {
    author = {
      name: strFromUnknown((o.author as Record<string, unknown>).name),
    };
  }

  let image: JsonLdShape["image"] | undefined;
  if (typeof o.image === "string") image = o.image;
  else if (Array.isArray(o.image) && typeof o.image[0] === "string")
    image = o.image[0];
  else if (Array.isArray(o.image) && typeof o.image[0] === "object")
    image = {
      url: strFromUnknown((o.image[0] as Record<string, unknown>).url),
    };
  else if (o.image && typeof o.image === "object")
    image = { url: strFromUnknown((o.image as Record<string, unknown>).url) };

  return {
    ...(headline ? { headline } : {}),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(image ? { image } : {}),
  };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractTagText(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = html.match(re);
  if (!m?.[1]) return undefined;
  return decodeEntities(m[1]).trim();
}

function pickStr(values: Array<string | undefined | null>): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function strFromUnknown(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => {
      if (ENTITY_MAP[m]) return ENTITY_MAP[m];
      const num = m.match(/^&#(\d+);$/);
      if (num?.[1]) return String.fromCharCode(Number(num[1]));
      return m;
    })
    .replace(/<[^>]+>/g, "");
}
