/**
 * Pure parser for Cosmos GraphQL responses captured by the preload
 * XHR/fetch hook ([`apps/desktop/src/preload/scrape.cjs.ts`](apps/desktop/src/preload/scrape.cjs.ts)).
 *
 * The response shape isn't documented and Cosmos ships schema changes
 * freely, so the parser is a defensive recursive walker rather than a
 * hard-coded path. Mirrors the loop in [twitter/graphql.ts](apps/desktop/src/main/core/refresh/harvest/twitter/graphql.ts)
 * (`drainCaptures` → parse → ingest).
 *
 * The user-elements operation is `GetUserPublicElementsClusterId`;
 * `GetProfileCounts` / `GetActivities` / `GetLoaderState` fire on the
 * same page and the walker ignores them by shape.
 */

import log from "electron-log/main.js";
import { z } from "zod";

// We can't validate the GraphQL envelope (shape undocumented, parser
// intentionally shape-blind) so we validate the *output* of
// `tryShapeElement` instead. Catches walker drift before it poisons
// the dedupe map; logs once per process.
const cosmosElementSchema = z.object({
  id: z.string().regex(/^\d+$/),
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaUrls: z
    .array(
      z.object({
        url: z.string(),
        type: z.enum(["image", "video"]).optional(),
        poster: z.string().optional(),
      }),
    )
    .optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  raw: z.unknown(),
});

let elementFailureLogged = false;

export interface CosmosCapture {
  url: string;
  body: string;
  status?: number;
}

export interface CosmosElement {
  /** Numeric Cosmos element id as a string (matches `/e/<id>` URLs). */
  id: string;
  url: string;
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url: string; type?: "image" | "video"; poster?: string }>;
  mediaType?: "image" | "video";
  /** Verbatim element node from the GraphQL response — stored on `raw.cosmos`. */
  raw: unknown;
}

// Last write wins on dedupe; Cosmos refetches the same query as the
// user scrolls and the later payloads tend to be more complete.
export function parseElementsFromCaptures(
  captures: CosmosCapture[],
): Map<string, CosmosElement> {
  const out = new Map<string, CosmosElement>();
  for (const cap of captures) {
    if (!isLikelyElementsUrl(cap.url)) continue;
    let json: unknown;
    try {
      json = JSON.parse(cap.body);
    } catch (err) {
      log.warn("[pond cosmos] capture body not JSON", cap.url, err);
      continue;
    }
    for (const el of walkForElements(json)) {
      out.set(el.id, el);
    }
  }
  return out;
}

// Cosmos's GraphQL endpoint pins the operation name on the query
// string (`?q=GetFoo`); skip ops we know don't carry elements.
function isLikelyElementsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? "";
    if (/element|cluster|library|profile|feed/i.test(q)) return true;
    return false;
  } catch {
    return false;
  }
}

// Cosmos shapes vary by query — some wrap elements in `{ edges:
// [{ node: … }] }`, others in `{ elements: […] }`, others inline them
// on the root payload. Walking the tree once and matching on shape
// covers them all without maintaining a parallel list of path
// expressions.
function* walkForElements(root: unknown): Generator<CosmosElement> {
  const stack: unknown[] = [root];
  const seenIds = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) stack.push(node[i]);
      continue;
    }
    if (typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;

    const element = tryShapeElement(obj);
    if (element && !seenIds.has(element.id)) {
      const validated = cosmosElementSchema.safeParse(element);
      if (!validated.success) {
        if (!elementFailureLogged) {
          elementFailureLogged = true;
          log.warn(
            "[pond cosmos] element schema drift",
            validated.error.issues.map((i) => i.path.join(".")).join(", "),
          );
        }
        continue;
      }
      seenIds.add(element.id);
      yield element;
      continue;
    }

    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (child && typeof child === "object") stack.push(child);
    }
  }
}

// Element qualifies on (positive int `id`) AND (one of title, media,
// mediaUrl, url, previewUrl, name). The combination keeps us off
// noise nodes like user records that also carry numeric ids.
function tryShapeElement(obj: Record<string, unknown>): CosmosElement | null {
  const id = readElementId(obj);
  if (!id) return null;

  const title =
    pickString(obj, ["title", "name", "displayTitle", "displayName"]) ??
    undefined;
  const description =
    pickString(obj, ["description", "caption", "body", "summary"]) ?? undefined;
  const author =
    pickAuthor(obj) ??
    pickString(obj, ["authorHandle", "creatorHandle"]) ??
    undefined;

  const media = collectMedia(obj);
  const looksElementLike =
    title !== undefined ||
    description !== undefined ||
    media.length > 0 ||
    typeof obj.url === "string";
  if (!looksElementLike) return null;

  const out: CosmosElement = {
    id,
    url: `https://www.cosmos.so/e/${id}`,
    raw: obj,
  };
  if (title) out.title = title;
  if (description) {
    out.description =
      description.length > 4000
        ? `${description.slice(0, 4000)}…`
        : description;
  }
  if (author) out.author = author;
  if (media.length > 0) {
    out.mediaUrls = media;
    out.mediaUrl = media[0]?.url;
    out.mediaType = media[0]?.type ?? "image";
  }
  return out;
}

// Reject UUIDs (media ids) and arbitrary strings; element ids are
// always positive integers.
function readElementId(obj: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    obj.id,
    obj.elementId,
    obj.element_id,
    obj.nodeId,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isInteger(c) && c > 0) {
      return String(c);
    }
    if (typeof c === "string" && /^\d+$/.test(c) && c !== "0") {
      return c;
    }
  }
  return null;
}

function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickAuthor(obj: Record<string, unknown>): string | null {
  const authorNode = obj.author ?? obj.user ?? obj.creator;
  if (authorNode && typeof authorNode === "object") {
    const a = authorNode as Record<string, unknown>;
    const handle =
      pickString(a, ["username", "handle", "screenName", "slug"]) ?? null;
    if (handle) return handle.startsWith("@") ? handle : `@${handle}`;
    const name = pickString(a, ["name", "displayName"]);
    if (name) return name;
  }
  return null;
}

// Dedupe by URL — the same asset often appears under both `media`
// and `previewUrl`.
function collectMedia(
  obj: Record<string, unknown>,
): NonNullable<CosmosElement["mediaUrls"]> {
  const seen = new Set<string>();
  const out: NonNullable<CosmosElement["mediaUrls"]> = [];

  const tryPush = (url: unknown, type?: "image" | "video", poster?: string) => {
    if (typeof url !== "string" || url.length === 0) return;
    if (url.startsWith("data:")) return;
    const abs = url.startsWith("//") ? `https:${url}` : url;
    if (seen.has(abs)) return;
    seen.add(abs);
    const entry: { url: string; type?: "image" | "video"; poster?: string } = {
      url: abs,
    };
    if (type) entry.type = type;
    if (poster) entry.poster = poster;
    out.push(entry);
  };

  const mediaArr = obj.media ?? obj.mediaItems ?? obj.assets;
  if (Array.isArray(mediaArr)) {
    for (const m of mediaArr) {
      if (!m || typeof m !== "object") continue;
      const mo = m as Record<string, unknown>;
      const url =
        pickString(mo, [
          "url",
          "src",
          "previewUrl",
          "originalUrl",
          "thumbnailUrl",
        ]) ?? null;
      if (!url) continue;
      const kind = detectMediaType(mo, url);
      const poster = pickString(mo, ["poster", "thumbnailUrl"]) ?? undefined;
      tryPush(url, kind, poster);
    }
  }

  tryPush(obj.previewUrl, detectMediaType(obj, obj.previewUrl));
  tryPush(obj.mediaUrl, detectMediaType(obj, obj.mediaUrl));
  tryPush(obj.imageUrl, "image");
  tryPush(obj.thumbnailUrl, "image");
  tryPush(obj.videoUrl, "video");

  return out;
}

function detectMediaType(
  obj: Record<string, unknown>,
  urlMaybe: unknown,
): "image" | "video" | undefined {
  const explicit = pickString(obj, ["type", "kind", "mediaType", "media_type"]);
  if (explicit) {
    const v = explicit.toLowerCase();
    if (v.includes("video")) return "video";
    if (v.includes("image") || v.includes("photo") || v.includes("picture")) {
      return "image";
    }
  }
  if (typeof urlMaybe === "string") {
    if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(urlMaybe)) return "video";
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(urlMaybe)) return "image";
  }
  return undefined;
}
