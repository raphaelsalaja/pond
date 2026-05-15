import type { Source } from "@pond/schema/db";

export interface ResolvedSource {
  source: Source;
  sourceId: string;
  url: string;
}

export function urlToSource(rawUrl: string): ResolvedSource | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;

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

  if (host === "cosmos.so") {
    if (path === "/" || path === "") return null;
    return {
      source: "cosmos",
      sourceId: path.replace(/\/$/, "").replace(/^\//, ""),
      url: `https://www.cosmos.so${path}`,
    };
  }

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const video = path.match(/\/video\/(\d+)/);
    const id = video?.[1];
    if (id) {
      return {
        source: "tiktok",
        sourceId: id,
        url: `https://www.tiktok.com${path}`,
      };
    }
    return null;
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) {
      return {
        source: "youtube",
        sourceId: v,
        url: `https://www.youtube.com/watch?v=${v}`,
      };
    }
    const shorts = path.match(/^\/shorts\/([\w-]+)/);
    const sid = shorts?.[1];
    if (sid) {
      return {
        source: "youtube",
        sourceId: sid,
        url: `https://www.youtube.com/watch?v=${sid}`,
      };
    }
  }
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (id) {
      return {
        source: "youtube",
        sourceId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    }
  }

  if (url.protocol === "https:" || url.protocol === "http:") {
    const normalized = normalizeArticleUrl(url);
    return {
      source: "article",
      sourceId: normalized.slice(0, 256),
      url: normalized,
    };
  }

  return null;
}

function normalizeArticleUrl(u: URL): string {
  const drop = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "ref_url",
  ]);
  const out = new URL(u.toString());
  for (const key of [...out.searchParams.keys()]) {
    if (drop.has(key) || key.startsWith("utm_")) {
      out.searchParams.delete(key);
    }
  }
  out.hash = "";
  return out.toString();
}

const HOST_LABELS: Record<Source, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  pinterest: "Pinterest",
  arena: "Are.na",
  cosmos: "Cosmos",
  tiktok: "TikTok",
  youtube: "YouTube",
  article: "Article",
};

export function sourceLabel(source: Source): string {
  return HOST_LABELS[source];
}

export function cookieDomainForSource(source: Source): string | null {
  switch (source) {
    case "twitter":
      return ".x.com";
    case "instagram":
      return ".instagram.com";
    case "tiktok":
      return ".tiktok.com";
    case "pinterest":
      return ".pinterest.com";
    case "youtube":
      return ".youtube.com";
    case "cosmos":
      return ".cosmos.so";
    case "arena":
      return ".are.na";
    case "article":
      return null;
  }
}

export const PUBLIC_PROFILE_SOURCES: ReadonlySet<Source> = new Set<Source>([
  "cosmos",
  "arena",
]);

export function hostToSource(rawUrl: string): Source | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (host === "x.com" || host === "twitter.com") return "twitter";
  if (host === "instagram.com") return "instagram";
  if (host === "pinterest.com" || host.endsWith(".pinterest.com")) {
    return "pinterest";
  }
  if (host === "are.na") return "arena";
  if (host === "cosmos.so") return "cosmos";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be"
  ) {
    return "youtube";
  }
  return null;
}
