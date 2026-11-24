import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { LINKEDIN_PATTERNS } from "../url-patterns";

export class LinkedInPostExtractor implements Extractor {
  readonly id = "linkedin-post";
  readonly source = "linkedin" as const;
  readonly validUrl = LINKEDIN_PATTERNS;
  readonly cookieDomain = ".linkedin.com";
  /** Voyager rejects requests without `csrf-token`, which must echo the JSESSIONID cookie minus its quotes. */
  readonly probeExpression = `(async () => {
        try {
          const jsession = (document.cookie.match(/(?:^|;\\s*)JSESSIONID=([^;]+)/) || [])[1] || '';
          const res = await fetch('/voyager/api/me', {
            credentials: 'include',
            headers: {
              accept: 'application/vnd.linkedin.normalized+json+2.1',
              'csrf-token': jsession.replace(/"/g, ''),
              'x-restli-protocol-version': '2.0.0',
            },
          });
          if (!res.ok) return '';
          const body = await res.json();
          const included = Array.isArray(body?.included) ? body.included : [];
          const mini = included.find((e) => typeof e?.publicIdentifier === 'string');
          if (mini) return mini.publicIdentifier;
          const inline = body?.miniProfile?.publicIdentifier ?? body?.data?.miniProfile?.publicIdentifier;
          return typeof inline === 'string' ? inline : '';
        } catch { return ''; }
      })()`;

  /** `li_at` is the session token; LinkedIn only sets it after sign-in. */
  authCookies(name: string, value?: string): boolean {
    return name === "li_at" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first, vanity] = segments;
    if (segments.length !== 2 || first !== "in" || !vanity) {
      return null;
    }
    return /^[A-Za-z0-9_-]{2,100}$/.test(vanity) ? vanity : null;
  }

  readonly tests = [
    {
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7212345678901234567/",
      id: "7212345678901234567",
      profile: {
        url: "https://www.linkedin.com/in/janedoe/",
        handle: "janedoe",
      },
    },
    {
      url: "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7212345678901234567",
      id: "7212345678901234567",
    },
    {
      url: "https://www.linkedin.com/feed/update/urn:li:ugcPost:7198765432109876543?utm_source=share",
      id: "7198765432109876543",
    },
    {
      url: "https://www.linkedin.com/posts/janedoe_design-systems-activity-7212345678901234567-AbCd/",
      id: "7212345678901234567",
    },
    {
      url: "https://linkedin.com/posts/acme-corp_launch-ugcPost-7198765432109876543-x9Yz?utm_medium=ios_app",
      id: "7198765432109876543",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  /** Ingests the URL as saved: a ugcPost id cannot be rewritten into an activity URL. */
  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("linkedin", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse linkedin post");
    }
    return captureFromSource({
      url: input.url.href,
      source: "linkedin",
      sourceId,
    });
  }
}
