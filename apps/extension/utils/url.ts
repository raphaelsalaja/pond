import { ROTATING_SESSIONS } from "@pond/schema/session";
import { SOURCES, type Source } from "@pond/schema/source-ids";

/** The Source whose session the browser just rotated, when this cookie change is one. */
export function rotatedSessionSource(cookie: {
  name: string;
  domain: string;
}): Source | null {
  const host = cookie.domain.replace(/^\./, "").toLowerCase();
  for (const [source, session] of ROTATING_SESSIONS) {
    if (!session.rotates.includes(cookie.name)) continue;
    if (host === session.domain || host.endsWith(`.${session.domain}`)) {
      return source;
    }
  }
  return null;
}

export function cookieDomainsForSource(source: Source): string[] {
  switch (source) {
    case "twitter":
      return ["x.com", "twitter.com"];
    case "instagram":
      return ["instagram.com"];
    case "tiktok":
      return ["tiktok.com"];
    case "pinterest":
      return ["pinterest.com"];
    case "youtube":
      return ["youtube.com", "google.com"];
    case "cosmos":
      return ["cosmos.so"];
    case "arena":
      return ["are.na"];
    case "reddit":
      return ["reddit.com"];
    case "threads":
      return ["threads.net", "threads.com", "instagram.com"];
    case "github":
      return ["github.com"];
    case "substack":
      return ["substack.com"];
    case "tumblr":
      return ["tumblr.com"];
    case "savee":
      return ["savee.com", "savee.it"];
    case "behance":
      return ["behance.net"];
    case "vimeo":
      return ["vimeo.com"];
    case "dribbble":
      return ["dribbble.com"];
    case "unsplash":
      return ["unsplash.com"];
    case "bluesky":
      return [];
    case "marked":
      return ["marked.dev"];
    case "web":
    case "local":
      return [];
  }
}

export function isCookieSourceUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SOURCES.some((source) =>
    cookieDomainsForSource(source).some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    ),
  );
}
