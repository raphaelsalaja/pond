/// <reference lib="dom" />

/**
 * Cosmos renders each element as a `<button>` (no `<a href="/e/...">`)
 * so DOM scraping can't recover the id list. We lean on the GraphQL
 * XHR/fetch hook the preload installs on `cosmos.so`
 * ([apps/desktop/src/preload/scrape.cjs.ts](apps/desktop/src/preload/scrape.cjs.ts))
 * and parse the buffered responses in-page.
 */

import type { MediaType } from "@pond/schema/db";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";

export function cosmosProfileUrl(handle: string): string {
  return `https://www.cosmos.so/${encodeURIComponent(handle)}`;
}

// Fallback for callers without an account key; the router prefers
// `cosmosProfileUrl(accountKey)`.
export const COSMOS_LIST_URL = "https://www.cosmos.so/library";

const SCROLL_DEADLINE_MS = 60_000;

export function buildCosmosListExpression(args: ListHarvestArgs): string {
  const fnSrc = `(${inPageCosmosList.toString()})`;
  const enriched = { ...args, scrollDeadlineMs: SCROLL_DEADLINE_MS };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/**
 * Inlined into the page via `executeJavaScript`. Keep it
 * self-contained (no imports, no closure references) — anything that
 * doesn't survive `Function.toString()` will be undefined at runtime.
 */
async function inPageCosmosList(
  args: ListHarvestArgs & { scrollDeadlineMs: number },
): Promise<ListHarvestResult> {
  if (
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/sign-in")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  interface CosmosCapture {
    url: string;
    body: string;
    status?: number;
  }

  interface CosmosEntry {
    sourceId: string;
    url: string;
    title?: string;
    description?: string;
    author?: string;
    mediaUrl?: string;
    mediaUrls?: Array<{
      url: string;
      type?: MediaType;
      poster?: string;
    }>;
    mediaType?: MediaType;
  }

  const known = new Set(args.knownIds.map(String));
  const collected = new Map<string, CosmosEntry>();

  // Verbatim mirror of every drained capture so the main process can
  // pull bodies out via `executeJavaScript` after the run when
  // `POND_DUMP_COSMOS_CAPTURES` is set. See `dumpCosmosCaptures` in
  // `apps/desktop/src/main/core/refresh/scrape-window.ts`.
  (
    globalThis as unknown as { __pondCosmosCapturesArchive?: CosmosCapture[] }
  ).__pondCosmosCapturesArchive = [];

  const peekCaptures = (): CosmosCapture[] => {
    const buf = (
      globalThis as unknown as { __pondCosmosCaptures?: CosmosCapture[] }
    ).__pondCosmosCaptures;
    return Array.isArray(buf) ? buf : [];
  };
  const drainCaptures = (): CosmosCapture[] => {
    const buf = (
      globalThis as unknown as { __pondCosmosCaptures?: CosmosCapture[] }
    ).__pondCosmosCaptures;
    if (!Array.isArray(buf) || buf.length === 0) return [];
    const out = buf.splice(0);
    const archive = (
      globalThis as unknown as {
        __pondCosmosCapturesArchive?: CosmosCapture[];
      }
    ).__pondCosmosCapturesArchive;
    if (Array.isArray(archive)) for (const c of out) archive.push(c);
    return out;
  };

  const isLikelyElementsUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      const q = u.searchParams.get("q") ?? "";
      return /element|cluster|library|profile|feed/i.test(q);
    } catch {
      return false;
    }
  };

  const pickString = (
    obj: Record<string, unknown>,
    keys: string[],
  ): string | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return undefined;
  };

  const readElementId = (obj: Record<string, unknown>): string | null => {
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
      if (typeof c === "string" && /^\d+$/.test(c) && c !== "0") return c;
    }
    return null;
  };

  const detectMediaType = (
    obj: Record<string, unknown>,
    urlMaybe: unknown,
  ): "image" | "video" | undefined => {
    const explicit = pickString(obj, [
      "type",
      "kind",
      "mediaType",
      "media_type",
    ]);
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
  };

  const collectMedia = (
    obj: Record<string, unknown>,
  ): CosmosEntry["mediaUrls"] => {
    const seen = new Set<string>();
    const out: NonNullable<CosmosEntry["mediaUrls"]> = [];
    const tryPush = (url: unknown, type?: MediaType, poster?: string) => {
      if (typeof url !== "string" || url.length === 0) return;
      if (url.startsWith("data:")) return;
      const abs = url.startsWith("//") ? `https:${url}` : url;
      if (seen.has(abs)) return;
      seen.add(abs);
      const entry: { url: string; type?: MediaType; poster?: string } = {
        url: abs,
      };
      if (type) entry.type = type;
      if (poster) entry.poster = poster;
      out.push(entry);
    };
    const arr = obj.media ?? obj.mediaItems ?? obj.assets;
    if (Array.isArray(arr)) {
      for (const m of arr) {
        if (!m || typeof m !== "object") continue;
        const mo = m as Record<string, unknown>;
        const url = pickString(mo, [
          "url",
          "src",
          "previewUrl",
          "originalUrl",
          "thumbnailUrl",
        ]);
        if (!url) continue;
        tryPush(
          url,
          detectMediaType(mo, url),
          pickString(mo, ["poster", "thumbnailUrl"]),
        );
      }
    }
    tryPush(obj.previewUrl, detectMediaType(obj, obj.previewUrl));
    tryPush(obj.mediaUrl, detectMediaType(obj, obj.mediaUrl));
    tryPush(obj.imageUrl, "image");
    tryPush(obj.thumbnailUrl, "image");
    tryPush(obj.videoUrl, "video");
    return out.length > 0 ? out : undefined;
  };

  const pickAuthor = (obj: Record<string, unknown>): string | undefined => {
    const node = obj.author ?? obj.user ?? obj.creator;
    if (node && typeof node === "object") {
      const a = node as Record<string, unknown>;
      const handle = pickString(a, [
        "username",
        "handle",
        "screenName",
        "slug",
      ]);
      if (handle) return handle.startsWith("@") ? handle : `@${handle}`;
      const name = pickString(a, ["name", "displayName"]);
      if (name) return name;
    }
    return undefined;
  };

  const tryShapeElement = (
    obj: Record<string, unknown>,
  ): CosmosEntry | null => {
    const id = readElementId(obj);
    if (!id) return null;
    const title = pickString(obj, [
      "title",
      "name",
      "displayTitle",
      "displayName",
    ]);
    const description = pickString(obj, [
      "description",
      "caption",
      "body",
      "summary",
    ]);
    const author = pickAuthor(obj);
    const media = collectMedia(obj);
    const looksElementLike =
      title !== undefined ||
      description !== undefined ||
      (media && media.length > 0) ||
      typeof obj.url === "string";
    if (!looksElementLike) return null;

    const entry: CosmosEntry = {
      sourceId: id,
      url: `https://www.cosmos.so/e/${id}`,
    };
    if (title) entry.title = title;
    if (description) {
      entry.description =
        description.length > 4000
          ? `${description.slice(0, 4000)}…`
          : description;
    }
    if (author) entry.author = author;
    if (media && media.length > 0) {
      entry.mediaUrls = media;
      entry.mediaUrl = media[0]?.url;
      entry.mediaType = media[0]?.type ?? "image";
    }
    return entry;
  };

  const walkForElements = (root: unknown): CosmosEntry[] => {
    const out: CosmosEntry[] = [];
    const seen = new Set<string>();
    const stack: unknown[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) stack.push(node[i]);
        continue;
      }
      if (typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const el = tryShapeElement(obj);
      if (el && !seen.has(el.sourceId)) {
        seen.add(el.sourceId);
        out.push(el);
        continue;
      }
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (child && typeof child === "object") stack.push(child);
      }
    }
    return out;
  };

  const ingestCaptures = (caps: CosmosCapture[]): { added: number } => {
    let added = 0;
    for (const cap of caps) {
      if (!isLikelyElementsUrl(cap.url)) continue;
      let json: unknown;
      try {
        json = JSON.parse(cap.body);
      } catch {
        continue;
      }
      for (const el of walkForElements(json)) {
        if (collected.has(el.sourceId)) continue;
        collected.set(el.sourceId, el);
        added += 1;
        if (collected.size >= args.maxItems) return { added };
      }
    }
    return { added };
  };

  const freshEntries = (): CosmosEntry[] => {
    const out: CosmosEntry[] = [];
    for (const [id, e] of collected) {
      if (known.has(id)) continue;
      out.push(e);
    }
    return out;
  };

  const stats: {
    phase: "hydrate" | "scroll" | "done";
    collected: number;
    fresh: number;
    captures: number;
    scrolls: number;
    updatedAt: number;
  } = {
    phase: "hydrate",
    collected: 0,
    fresh: 0,
    captures: 0,
    scrolls: 0,
    updatedAt: Date.now(),
  };
  (
    globalThis as unknown as { __pondHarvestStats?: typeof stats }
  ).__pondHarvestStats = stats;
  const publishStats = (phase: typeof stats.phase): void => {
    stats.phase = phase;
    stats.collected = collected.size;
    let fresh = 0;
    for (const id of collected.keys()) if (!known.has(id)) fresh += 1;
    stats.fresh = fresh;
    stats.captures = peekCaptures().length;
    stats.updatedAt = Date.now();
  };

  const hydrateDeadline = Date.now() + 20_000;
  while (Date.now() < hydrateDeadline) {
    if (peekCaptures().length > 0) break;
    if (collected.size > 0) break;
    publishStats("hydrate");
    await new Promise((r) => setTimeout(r, 250));
  }
  ingestCaptures(drainCaptures());
  publishStats("scroll");
  if (collected.size >= args.maxItems) {
    return {
      ok: true,
      entries: freshEntries(),
      reachedEnd: false,
    };
  }

  const scrollDeadline = Date.now() + args.scrollDeadlineMs;
  let stable = 0;
  let lastSize = collected.size;
  while (Date.now() < scrollDeadline) {
    window.scrollBy({
      top: window.innerHeight * 0.9,
      behavior: "instant" as ScrollBehavior,
    });
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 300));
    stats.scrolls += 1;
    ingestCaptures(drainCaptures());
    publishStats("scroll");
    if (collected.size >= args.maxItems) {
      return {
        ok: true,
        entries: freshEntries(),
        reachedEnd: false,
      };
    }
    if (collected.size === lastSize) {
      stable += 1;
      // 5 stable ticks ≈ 4–5 seconds of no new captures or DOM growth.
      if (stable >= 5) {
        return {
          ok: true,
          entries: freshEntries(),
          reachedEnd: true,
        };
      }
    } else {
      stable = 0;
      lastSize = collected.size;
    }
  }

  return {
    ok: true,
    entries: freshEntries(),
    reachedEnd: false,
  };
}
