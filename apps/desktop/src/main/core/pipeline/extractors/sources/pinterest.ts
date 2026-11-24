import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, PINTEREST_PATTERNS } from "../url-patterns";

export const PINTEREST_RESERVED_ROOTS = new Set([
  "about",
  "business",
  "ideas",
  "join",
  "login",
  "me",
  "news_hub",
  "pin",
  "resource",
  "search",
  "settings",
  "shop",
  "signup",
  "today",
  "videos",
]);

export class PinterestPinExtractor implements Extractor {
  readonly id = "pinterest-pin";
  readonly source = "pinterest" as const;
  readonly validUrl = PINTEREST_PATTERNS;
  readonly cookieDomain = ".pinterest.com";

  get probeExpression(): string {
    const reserved = JSON.stringify([...PINTEREST_RESERVED_ROOTS]);
    return `(async () => {
        try {
          const reserved = new Set(${reserved});
          const ok = (value) => {
            const handle = String(value || '').replace(/^@/, '');
            if (!handle || reserved.has(handle.toLowerCase())) return '';
            if (!/^[A-Za-z0-9._-]{2,40}$/.test(handle)) return '';
            return handle;
          };
          const fromPath = (path) => {
            const m = String(path || '').match(/^\\/([A-Za-z0-9._-]+)/);
            return m ? ok(m[1]) : '';
          };
          const here = fromPath(location.pathname);
          if (here) return here;
          try {
            const res = await fetch('/me/', { redirect: 'follow', credentials: 'include' });
            const redirected = fromPath(new URL(res.url, location.origin).pathname);
            if (redirected) return redirected;
          } catch {}
          const pws = document.getElementById('__PWS_DATA__');
          if (pws) {
            const data = JSON.parse(pws.textContent || '{}');
            const u = data?.props?.context?.user?.username
              || data?.props?.context?.viewer?.username;
            const fromPws = ok(u);
            if (fromPws) return fromPws;
          }
          const selectors = [
            'a[data-test-id="header-profile"]',
            'a[data-test-id="header-profile-image"]',
            'a[data-test-id="headerUserName"]',
            'a[href$="/_saved/"]',
            'a[href$="/_created/"]',
          ];
          for (const sel of selectors) {
            const href = document.querySelector(sel)?.getAttribute('href') || '';
            const m = href.match(/^\\/([A-Za-z0-9._-]+)/);
            const fromLink = m ? ok(m[1]) : '';
            if (fromLink) return fromLink;
          }
          const html = document.documentElement.innerHTML;
          const viewer = html.match(/"viewer"\\s*:\\s*\\{[^{}]{0,400}?"username"\\s*:\\s*"([A-Za-z0-9._-]+)"/);
          return viewer ? ok(viewer[1]) : '';
        } catch { return ''; }
      })()`;
  }

  authCookies(name: string, value?: string): boolean {
    /** `_pinterest_sess` is set for everyone; `_auth` is `"0"` while signed out. */
    if (name !== "_auth") {
      return false;
    }
    return value === undefined || value === "1";
  }

  handleFromPath(segments: Array<string>): string | null {
    const first = segments[0];
    if (!first) {
      return null;
    }
    if (PINTEREST_RESERVED_ROOTS.has(first.toLowerCase())) {
      return null;
    }
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(first)) {
      return null;
    }
    return first;
  }

  readonly tests = [
    {
      url: "https://www.pinterest.com/pin/12345/",
      id: "12345",
      profile: {
        url: "https://www.pinterest.com/someuser/",
        handle: "someuser",
      },
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const pinId = match?.[1] ?? null;
    if (!pinId) {
      throw new TerminalError("could not parse pinterest id");
    }

    return captureFromSource({
      url: input.url.href,
      source: "pinterest",
      sourceId: pinId,
    });
  }
}
