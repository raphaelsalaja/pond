import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, TIKTOK_PATTERNS } from "../url-patterns";

const TIKTOK_RESERVED_ROOTS = new Set([
  "about",
  "activity",
  "business",
  "discover",
  "effect",
  "embed",
  "explore",
  "following",
  "foryou",
  "friends",
  "inbox",
  "live",
  "login",
  "logout",
  "messages",
  "music",
  "search",
  "setting",
  "settings",
  "signup",
  "studio",
  "tag",
  "upload",
  "video",
  "videos",
]);

export class TikTokVideoExtractor implements Extractor {
  readonly id = "tiktok-video";
  readonly source = "tiktok" as const;
  readonly validUrl = TIKTOK_PATTERNS;
  readonly cookieDomain = ".tiktok.com";

  get probeExpression(): string {
    const reserved = JSON.stringify([...TIKTOK_RESERVED_ROOTS]);
    return `(async () => {
        try {
          const reserved = new Set(${reserved});
          const ok = (value) => {
            const handle = String(value || '').replace(/^@/, '');
            if (!handle || reserved.has(handle.toLowerCase())) return '';
            if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) return '';
            return handle;
          };
          const fromHydration = () => {
            const read = (raw) => {
              if (!raw || typeof raw !== 'object') return '';
              const app = raw.__DEFAULT_SCOPE__ && raw.__DEFAULT_SCOPE__['webapp.app-context'];
              const scopeUser = app && (app.user || (app.userInfo && app.userInfo.user));
              const sigiUser = raw.AppContext && (raw.AppContext.user || (raw.AppContext.appContext && raw.AppContext.appContext.user));
              return ok((scopeUser && scopeUser.uniqueId) || (sigiUser && sigiUser.uniqueId));
            };
            const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__')
              || document.getElementById('SIGI_STATE');
            if (script && script.textContent) {
              try {
                const fromScript = read(JSON.parse(script.textContent));
                if (fromScript) return fromScript;
              } catch {}
            }
            return read(globalThis.__UNIVERSAL_DATA_FOR_REHYDRATION__)
              || read(globalThis.SIGI_STATE);
          };
          const fromNav = () => {
            const selectors = [
              'a[data-e2e="nav-profile"]',
              'a[data-e2e="bottom-nav-profile"]',
              'a[data-e2e="profile-icon"]',
            ];
            for (const sel of selectors) {
              const href = document.querySelector(sel)?.getAttribute('href') || '';
              const m = href.match(/^\\/@([A-Za-z0-9._]+)/);
              const handle = m ? ok(m[1]) : '';
              if (handle) return handle;
            }
            return '';
          };
          const deadline = Date.now() + 12_000;
          while (Date.now() < deadline) {
            const handle = fromHydration() || fromNav();
            if (handle) return handle;
            await new Promise((r) => setTimeout(r, 250));
          }
          return '';
        } catch { return ''; }
      })()`;
  }

  authCookies(name: string): boolean {
    return name === "sessionid" || name === "sid_tt";
  }

  handleFromPath(segments: Array<string>): string | null {
    const first = segments[0];
    if (!first) {
      return null;
    }
    const handle = first.startsWith("@") ? first.slice(1) : first;
    if (TIKTOK_RESERVED_ROOTS.has(handle.toLowerCase())) {
      return null;
    }
    if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) {
      return null;
    }
    return handle;
  }

  readonly tests = [
    {
      url: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
      id: "6718335390845095173",
      profile: {
        url: "https://www.tiktok.com/@scout2015",
        handle: "scout2015",
      },
    },
    {
      url: "https://www.tiktok.com/video/6718335390845095173",
      id: "6718335390845095173",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const canonical = input.url.href;
    const match = firstMatch(input.url, this.validUrl);
    const tiktokId = match?.[1] ?? canonical;
    if (!tiktokId) {
      throw new TerminalError("could not parse tiktok id");
    }
    return captureFromSource({
      url: canonical,
      source: "tiktok",
      sourceId: tiktokId,
    });
  }
}
