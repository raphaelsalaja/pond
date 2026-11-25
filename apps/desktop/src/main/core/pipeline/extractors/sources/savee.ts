import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { SAVEE_PATTERNS } from "../url-patterns";

/** First-level Savee paths that are app routes, not profiles. */
const SAVEE_RESERVED = new Set([
  "api",
  "boards",
  "collections",
  "developers",
  "explore",
  "feed",
  "i",
  "join",
  "lists",
  "login",
  "pop",
  "settings",
  "team",
  "you",
]);

export class SaveeItemExtractor implements Extractor {
  readonly id = "savee-item";
  readonly source = "savee" as const;
  readonly validUrl = SAVEE_PATTERNS;
  readonly cookieDomain = ".savee.com";
  readonly probeExpression = `(() => {
        try {
          const m = location.pathname.match(/^\\/([A-Za-z0-9_.-]+)\\/?$/);
          return m ? m[1] : '';
        } catch { return ''; }
      })()`;

  /** Savee sets no cookies for visitors beyond analytics, so any other cookie means a session; the GraphQL probe confirms it. */
  authCookies(name: string, value?: string): boolean {
    if (value !== undefined && value.length === 0) return false;
    return !/^(?:_ga|_gid|_gcl|ph_|OptanonConsent|__cf|cf_)/.test(name);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) return null;
    if (SAVEE_RESERVED.has(first.toLowerCase())) return null;
    return /^[A-Za-z0-9_.-]{1,40}$/.test(first) ? first : null;
  }

  readonly tests = [
    {
      url: "https://savee.com/i/h4W8146/",
      id: "h4W8146",
      profile: { url: "https://savee.com/podendaal/", handle: "podendaal" },
    },
    { url: "https://savee.it/i/h4W8146", id: "h4W8146" },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("savee", input.url.href);
    if (!sourceId) throw new TerminalError("could not parse savee item");
    return captureFromSource({
      url: `https://savee.com/i/${sourceId}/`,
      source: "savee",
      sourceId,
    });
  }
}
