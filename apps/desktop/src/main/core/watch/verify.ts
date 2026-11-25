import type { Source } from "@pond/schema/db";
import type { WatchTarget } from "./resolve";
import type { FetchWatchPage } from "./types";

const CRAWLER_UA =
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

function decodeText(text: string): string {
  return text
    .replaceAll(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
      const point = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number(code);
      return point > 0 && point <= 0x10_ff_ff
        ? String.fromCodePoint(point)
        : entity;
    })
    .replaceAll("&quot;", '"')
    .replaceAll(/&apos;|&#39;/g, "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function metadata(html: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
      if (match[1] && match[3] !== undefined) {
        attributes.set(match[1].toLowerCase(), decodeText(match[3]));
      }
    }
    const name = attributes.get("property") ?? attributes.get("name");
    const content = attributes.get("content");
    if (name && content !== undefined) result.set(name.toLowerCase(), content);
  }
  return result;
}

function targetUrl(source: Source, target: WatchTarget): string | null {
  const path = target.handle.split("/").map(encodeURIComponent).join("/");
  switch (source) {
    case "youtube": {
      if (target.kind === "playlist") {
        return `https://www.youtube.com/playlist?list=${encodeURIComponent(target.handle)}`;
      }
      const owner = path.split("/")[0] ?? path;
      return /^UC[\w-]{20,}$/.test(owner)
        ? `https://www.youtube.com/channel/${owner}`
        : `https://www.youtube.com/@${owner}`;
    }
    case "tiktok":
      return `https://www.tiktok.com/@${path}`;
    case "instagram":
      return `https://www.instagram.com/${path}/`;
    case "twitter":
      return target.kind === "list"
        ? `https://x.com/i/lists/${path}`
        : `https://x.com/${path}`;
    case "pinterest":
      return `https://www.pinterest.com/${path}/`;
    case "cosmos":
      return `https://www.cosmos.so/${path}`;
    default:
      return null;
  }
}

function samePage(left: string | undefined, right: string): boolean {
  if (!left) return false;
  try {
    const a = new URL(left);
    const b = new URL(right);
    return (
      a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") &&
      decodeURIComponent(a.pathname).replace(/\/$/, "").toLowerCase() ===
        decodeURIComponent(b.pathname).replace(/\/$/, "").toLowerCase() &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

/** A successful HTTP response alone is not evidence: several platforms return 200 for missing profiles. */
export async function verifyWatchTarget(
  source: Source,
  target: WatchTarget,
  fetchPage: FetchWatchPage,
): Promise<WatchTarget | null> {
  const url = targetUrl(source, target);
  if (!url) return null;
  const headers = new Headers({
    "user-agent": CRAWLER_UA,
    accept: "text/html",
    "accept-language": "en-US,en;q=0.9",
  });
  if (source === "youtube") headers.set("cookie", "CONSENT=YES+cb; SOCS=CAI");
  const response = await fetchPage(url, {
    redirect: "follow",
    credentials: "omit",
    signal: AbortSignal.timeout(8000),
    headers,
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error("The platform could not be checked.");
  const html = await response.text();
  const meta = metadata(html);
  const title = meta.get("og:title") ?? "";
  const owner = target.handle.split("/")[0]?.toLowerCase() ?? "";
  const profile =
    meta.get("og:type") === "profile" && samePage(meta.get("og:url"), url);
  let confirmed = false;
  switch (source) {
    case "youtube": {
      if (target.kind === "playlist") {
        confirmed =
          samePage(meta.get("og:url"), url) &&
          /"playlistMetadataRenderer"\s*:/.test(html);
      } else {
        const vanity =
          /"vanityChannelUrl"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(html)?.[1];
        const externalId = /"externalId"\s*:\s*"(UC[\w-]{20,})"/.exec(
          html,
        )?.[1];
        confirmed =
          /"channelMetadataRenderer"\s*:/.test(html) &&
          !!externalId &&
          (samePage(vanity?.replaceAll(String.raw`\/`, "/"), url) ||
            (owner.startsWith("uc") && externalId.toLowerCase() === owner));
      }
      break;
    }
    case "tiktok":
      confirmed =
        samePage(meta.get("og:url"), url) &&
        (meta.get("og:description") ?? "")
          .toLowerCase()
          .startsWith(`@${owner} `) &&
        /\bfollowers\b/i.test(meta.get("og:description") ?? "");
      break;
    case "instagram":
      confirmed = profile && title.toLowerCase().includes(`(@${owner})`);
      break;
    case "twitter":
      confirmed =
        target.kind === "user"
          ? profile && meta.get("profile:username")?.toLowerCase() === owner
          : samePage(meta.get("og:url"), url) &&
            !!title &&
            !!meta.get("og:image");
      break;
    case "pinterest":
      confirmed =
        target.kind === "user"
          ? profile
          : samePage(meta.get("og:url"), url) &&
            !!title &&
            !!meta.get("og:image");
      break;
    case "cosmos":
      confirmed =
        target.kind === "user"
          ? title.toLowerCase().endsWith(`(@${owner})`)
          : samePage(meta.get("og:url"), url) &&
            !!title &&
            !!meta.get("og:image");
      break;
    case "arena":
    case "behance":
    case "bluesky":
    case "dribbble":
    case "github":
    case "linkedin":
    case "local":
    case "marked":
    case "mymind":
    case "reddit":
    case "savee":
    case "substack":
    case "threads":
    case "tumblr":
    case "unsplash":
    case "vimeo":
    case "web":
      break;
  }
  if (!confirmed) {
    if (!title) {
      throw new Error("The platform did not provide account details.");
    }
    return null;
  }
  const display = title
    .replace(/\s*\(@[^)]+\).*$/, "")
    .replace(/ on TikTok$| - YouTube$| - Profile \| Pinterest$/i, "")
    .trim();
  const suffix = ` (${target.handle})`;
  const cleanDisplay =
    source === "pinterest" &&
    display.toLowerCase().endsWith(suffix.toLowerCase())
      ? display.slice(0, -suffix.length)
      : display;
  const pinterestImage =
    /"image_xlarge_url"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(html)?.[1];
  const image =
    source === "pinterest"
      ? pinterestImage?.replaceAll(String.raw`\/`, "/")
      : (meta.get("og:image:secure_url") ?? meta.get("og:image"));
  const avatar = image ? decodeText(image) : undefined;
  const result: WatchTarget = {
    ...target,
    display: cleanDisplay || target.display,
  };
  if (
    avatar &&
    /^https:\/\//i.test(avatar) &&
    !/opengraph-image|default_open_graph|rweb\/ssr\/default/i.test(avatar)
  ) {
    result.avatarUrl = avatar;
  }
  return result;
}
