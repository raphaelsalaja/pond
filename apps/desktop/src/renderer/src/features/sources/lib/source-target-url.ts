import type { Source, WatchKind } from "@pond/schema/db";
import { normalizeFeedUrl } from "@pond/schema/watches";

export interface SourceTarget {
  source: Source;
  handle: string | null;
  kind?: WatchKind;
}

function encodedPath(handle: string): string {
  return handle
    .trim()
    .replace(/^@/, "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export function sourceTargetUrl(target: SourceTarget): string | null {
  if (!target.handle) return null;
  if (target.kind === "feed") return normalizeFeedUrl(target.handle);
  const path = encodedPath(target.handle);
  if (!path) return null;

  switch (target.source) {
    case "instagram":
      return `https://www.instagram.com/${path}/`;
    case "twitter":
      return target.kind === "list"
        ? `https://x.com/i/lists/${path}`
        : `https://x.com/${path}`;
    case "threads":
      return `https://www.threads.com/@${path}`;
    case "reddit":
      return `https://www.reddit.com/user/${path}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${path}`;
    case "pinterest":
      return `https://www.pinterest.com/${path}/`;
    case "arena":
      return `https://www.are.na/${path}`;
    case "cosmos":
      return `https://www.cosmos.so/${path}`;
    case "youtube": {
      if (target.kind === "playlist") {
        return `https://www.youtube.com/playlist?list=${encodeURIComponent(
          target.handle.trim(),
        )}`;
      }
      const owner = path.split("/")[0] ?? path;
      return /^UC[\w-]{20,}$/.test(owner)
        ? `https://www.youtube.com/channel/${owner}`
        : `https://www.youtube.com/@${owner}`;
    }
    default:
      return null;
  }
}
