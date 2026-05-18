export interface OgTags {
  title?: string;
  description?: string;
  image?: string;
  video?: string;
  url?: string;
  siteName?: string;
  type?: string;
  author?: string;
  lang?: string;
  publishedAt?: string;
  canonical?: string;
  videoWidth?: number;
  videoHeight?: number;
  imageWidth?: number;
  imageHeight?: number;
  [key: string]: string | number | undefined;
}

const META_REGEX =
  /<meta\b[^>]*?(?:property|name|itemprop)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["'][^>]*\/?>/gi;
const META_REGEX_INVERTED =
  /<meta\b[^>]*?content\s*=\s*["']([^"']*)["'][^>]*?(?:property|name|itemprop)\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_LANG_REGEX = /<html[^>]+lang\s*=\s*["']([^"']+)["']/i;
const CANONICAL_REGEX =
  /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i;

export function parseOg(html: string): OgTags {
  const tags: Record<string, string> = {};
  const consume = (name: string, content: string) => {
    if (!name || !content) return;
    if (!(name in tags)) tags[name] = decodeHtmlEntities(content.trim());
  };
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex iteration
  while ((match = META_REGEX.exec(html)))
    consume(match[1] ?? "", match[2] ?? "");
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex iteration
  while ((match = META_REGEX_INVERTED.exec(html)))
    consume(match[2] ?? "", match[1] ?? "");

  const titleMatch = TITLE_REGEX.exec(html);
  const titleTag = titleMatch?.[1]?.trim();
  const langMatch = HTML_LANG_REGEX.exec(html);
  const canonicalMatch = CANONICAL_REGEX.exec(html);

  const og: OgTags = {};
  og.title = tags["og:title"] ?? tags["twitter:title"] ?? titleTag ?? undefined;
  og.description =
    tags["og:description"] ??
    tags["twitter:description"] ??
    tags.description ??
    undefined;
  og.image =
    tags["og:image:secure_url"] ??
    tags["og:image"] ??
    tags["twitter:image"] ??
    tags["twitter:image:src"] ??
    undefined;
  og.video =
    tags["og:video:secure_url"] ??
    tags["og:video:url"] ??
    tags["og:video"] ??
    tags["twitter:player:stream"] ??
    undefined;
  og.url = tags["og:url"] ?? undefined;
  og.siteName = tags["og:site_name"] ?? tags["application-name"] ?? undefined;
  og.type = tags["og:type"] ?? undefined;
  og.author =
    tags["og:author"] ??
    tags["article:author"] ??
    tags.author ??
    tags["twitter:creator"] ??
    undefined;
  og.lang = tags["og:locale"] ?? langMatch?.[1] ?? undefined;
  og.publishedAt =
    tags["article:published_time"] ??
    tags["og:article:published_time"] ??
    tags.datePublished ??
    undefined;
  og.canonical = canonicalMatch?.[1] ?? undefined;

  const numFromTag = (key: string): number | undefined => {
    const raw = tags[key];
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  og.videoWidth = numFromTag("og:video:width");
  og.videoHeight = numFromTag("og:video:height");
  og.imageWidth = numFromTag("og:image:width");
  og.imageHeight = numFromTag("og:image:height");

  return og;
}

const JSONLD_REGEX =
  /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function parseJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex iteration
  while ((m = JSONLD_REGEX.exec(html))) {
    const body = (m[1] ?? "").trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      const sliced = sliceJsonObjects(body);
      for (const s of sliced) {
        try {
          out.push(JSON.parse(s));
        } catch {
          /* skip malformed */
        }
      }
    }
  }
  return out;
}

function sliceJsonObjects(body: string): string[] {
  const slices: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        slices.push(body.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return slices;
}

export function parseInlineJson(
  html: string,
  marker: string | RegExp,
): unknown | null {
  const idx =
    typeof marker === "string" ? html.indexOf(marker) : html.search(marker);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  let depth = 0;
  let inStr = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseIso8601(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code: string) => {
      const n =
        code.startsWith("x") || code.startsWith("X")
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
      if (!Number.isFinite(n)) return "";
      try {
        return String.fromCodePoint(n);
      } catch {
        return "";
      }
    })
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
}
