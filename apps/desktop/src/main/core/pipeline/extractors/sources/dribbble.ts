import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { DRIBBBLE_PATTERNS } from "../url-patterns";

/** First-level Dribbble paths that are app routes, not profiles. */
const DRIBBBLE_RESERVED = new Set([
  "about",
  "account",
  "designers",
  "following",
  "hiring",
  "jobs",
  "learn",
  "pro",
  "search",
  "session",
  "shots",
  "signup",
  "signups",
  "stories",
  "tags",
  "uploads",
]);

export class DribbbleShotExtractor implements Extractor {
  readonly id = "dribbble-shot";
  readonly source = "dribbble" as const;
  readonly validUrl = DRIBBBLE_PATTERNS;
  readonly cookieDomain = ".dribbble.com";
  readonly probeExpression = `(() => {
        try {
          if (!document.body.classList.contains('logged-in')) return '';
          const link = document.querySelector('.nav-v2-avatar a[href^="/"], a.profile-link[href^="/"], [data-site-nav-element="User"] a[href^="/"]');
          const seg = link?.getAttribute('href')?.split('/').filter(Boolean)[0] || '';
          return /^[A-Za-z0-9_-]{2,40}$/.test(seg) ? seg : '';
        } catch { return ''; }
      })()`;

  /** Dribbble's cookie policy names `user_session_token` as the persistent sign-in cookie; `_dribbble_session` is set for visitors too. */
  authCookies(name: string, value?: string): boolean {
    return (
      name === "user_session_token" && (value === undefined || value.length > 0)
    );
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) {
      return null;
    }
    if (DRIBBBLE_RESERVED.has(first.toLowerCase())) {
      return null;
    }
    return /^[A-Za-z0-9_-]{2,40}$/.test(first) ? first : null;
  }

  readonly tests = [
    {
      url: "https://dribbble.com/shots/24970102-Coming-Soon-Hubano",
      id: "24970102",
      profile: { url: "https://dribbble.com/simplebits", handle: "simplebits" },
    },
    { url: "https://dribbble.com/shots/27755136", id: "27755136" },
    {
      url: "https://dribbble.com/shots/27755136-Measure-Twice-Print/attachments/1",
      id: "27755136",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("dribbble", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse dribbble shot");
    }
    return captureFromSource({
      url: input.url.href,
      source: "dribbble",
      sourceId,
    });
  }
}
