import type { Source } from "@pond/schema/db";

export interface ResolvedSource {
  source: Source;
  sourceId: string;
  url: string;
}

/**
 * Map a fully-qualified URL to a {source, sourceId, url} tuple suitable for
 * the ingest endpoint. Used by the manual capture surfaces (browser action,
 * context menu, keyboard shortcut) so we never store a row we can't dedup.
 *
 * Returns null if the URL doesn't belong to a supported platform or doesn't
 * point at a single saveable item (e.g. an IG profile root, a Pinterest
 * board index).
 */
export function urlToSource(rawUrl: string): ResolvedSource | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;

  // Twitter / X: /<handle>/status/<id>
  if (host === "x.com" || host === "twitter.com") {
    const m = path.match(/^\/[^/]+\/status\/(\d+)/);
    const id = m?.[1];
    if (id) {
      return {
        source: "twitter",
        sourceId: id,
        url: `https://x.com/i/web/status/${id}`,
      };
    }
    return null;
  }

  // Instagram: /p/<code>/, /reel/<code>/, /tv/<code>/
  if (host === "instagram.com") {
    const m = path.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    const code = m?.[1];
    if (code) {
      const segment = path.startsWith("/reel/")
        ? "reel"
        : path.startsWith("/tv/")
          ? "tv"
          : "p";
      return {
        source: "instagram",
        sourceId: code,
        url: `https://www.instagram.com/${segment}/${code}/`,
      };
    }
    return null;
  }

  // Pinterest: /pin/<id>/ (id is numeric)
  if (host === "pinterest.com" || host.endsWith(".pinterest.com")) {
    const m = path.match(/^\/pin\/(\d+)/);
    const id = m?.[1];
    if (id) {
      return {
        source: "pinterest",
        sourceId: id,
        url: `https://www.pinterest.com/pin/${id}/`,
      };
    }
    return null;
  }

  // Are.na: /<user>/<channel>/<block> or /block/<id>
  if (host === "are.na") {
    const block = path.match(/^\/block\/(\d+)/);
    const blockId = block?.[1];
    if (blockId) {
      return {
        source: "arena",
        sourceId: blockId,
        url: `https://www.are.na/block/${blockId}`,
      };
    }
    // Channel-scoped block URL: /<user>/<channel>/<blockSlug>-<id>
    const channelBlock = path.match(/-(\d+)\/?$/);
    const channelBlockId = channelBlock?.[1];
    if (channelBlockId) {
      return {
        source: "arena",
        sourceId: channelBlockId,
        url: `https://www.are.na${path}`,
      };
    }
    return null;
  }

  // Cosmos: /<user>/<slug-id> or /c/<cluster> — use the full pathname as
  // sourceId because slugs vary; the canonical URL is the page itself.
  if (host === "cosmos.so") {
    if (path === "/" || path === "") return null;
    return {
      source: "cosmos",
      sourceId: path.replace(/\/$/, "").replace(/^\//, ""),
      url: `https://www.cosmos.so${path}`,
    };
  }

  return null;
}

const HOST_LABELS: Record<Source, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  pinterest: "Pinterest",
  arena: "Are.na",
  cosmos: "Cosmos",
};

export function sourceLabel(source: Source): string {
  return HOST_LABELS[source];
}
