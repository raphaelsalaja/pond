import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { BEHANCE_PATTERNS } from "../url-patterns";

/** First-level Behance paths that are app routes, not profiles. */
const BEHANCE_RESERVED = new Set([
  "about",
  "assets",
  "blog",
  "galleries",
  "gallery",
  "hire",
  "joblist",
  "live",
  "login",
  "moodboard",
  "onboarding",
  "search",
  "signup",
]);

export class BehanceProjectExtractor implements Extractor {
  readonly id = "behance-project";
  readonly source = "behance" as const;
  readonly validUrl = BEHANCE_PATTERNS;
  readonly cookieDomain = ".behance.net";
  readonly probeExpression = `(() => {
        try {
          const raw = document.getElementById('beconfig-store_state')?.textContent;
          const state = raw ? JSON.parse(raw) : null;
          return state?.user?.loggedInUser?.username || '';
        } catch { return ''; }
      })()`;

  /** `iat0` is the Adobe IMS access token; visitors never get it. */
  authCookies(name: string, value?: string): boolean {
    return name === "iat0" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) return null;
    if (BEHANCE_RESERVED.has(first.toLowerCase())) return null;
    return /^[A-Za-z0-9_-]{2,40}$/.test(first) ? first : null;
  }

  readonly tests = [
    {
      url: "https://www.behance.net/gallery/187955675/Pizzeria-Alberico",
      id: "187955675",
      profile: { url: "https://www.behance.net/ladue", handle: "ladue" },
    },
    { url: "https://be.net/gallery/86248267/x", id: "86248267" },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("behance", input.url.href);
    if (!sourceId) throw new TerminalError("could not parse behance project");
    return captureFromSource({
      url: `https://www.behance.net/gallery/${sourceId}/${projectSlug(input.url)}`,
      source: "behance",
      sourceId,
    });
  }
}

/** Behance 404s a project URL without a slug, but any slug resolves. */
function projectSlug(url: URL): string {
  const slug = url.pathname.split("/")[3];
  return slug && /^[\w-]+$/.test(slug) ? slug : "a";
}
