import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { COSMOS_PATTERNS } from "../url-patterns";

export const COSMOS_RESERVED_ROOTS = new Set([
  "about",
  "activity",
  "clusters",
  "discover",
  "e",
  "explore",
  "feed",
  "following",
  "followers",
  "help",
  "home",
  "legal",
  "library",
  "likes",
  "login",
  "notifications",
  "onboarding",
  "pricing",
  "privacy",
  "search",
  "settings",
  "sign-in",
  "signin",
  "signup",
  "support",
  "terms",
]);

export class CosmosTileExtractor implements Extractor {
  readonly id = "cosmos-tile";
  readonly source = "cosmos" as const;
  readonly validUrl = COSMOS_PATTERNS;
  readonly cookieDomain = ".cosmos.so";

  get probeExpression(): string {
    const reserved = JSON.stringify([...COSMOS_RESERVED_ROOTS]);
    return `(() => {
        try {
          const reserved = new Set(${reserved});
          const ok = (value) => {
            const handle = String(value || '').replace(/^@/, '');
            if (!handle || reserved.has(handle.toLowerCase())) return '';
            if (!/^[A-Za-z0-9_-]{2,40}$/.test(handle)) return '';
            return handle;
          };
          const fromApollo = () => {
            try {
              const ac = Object.getOwnPropertyDescriptor(globalThis, '__APOLLO_CLIENT__')?.value;
              const cache = ac?.cache?.extract?.();
              if (!cache) return '';
              const visit = (node, depth) => {
                if (!node || depth > 6) return '';
                if (Array.isArray(node)) {
                  for (const child of node) {
                    const found = visit(child, depth + 1);
                    if (found) return found;
                  }
                  return '';
                }
                if (typeof node !== 'object') return '';
                if (node.isMe === true || node.isViewer === true || node.isCurrentUser === true) {
                  const mine = ok(node.username || node.handle);
                  if (mine) return mine;
                }
                const me = node.me;
                if (me && typeof me === 'object') {
                  const mine = ok(me.username || me.handle);
                  if (mine) return mine;
                }
                for (const key of Object.keys(node)) {
                  if (key === 'me' || /viewer|currentUser|current_user/i.test(key)) {
                    const found = visit(node[key], depth + 1);
                    if (found) return found;
                  }
                }
                return '';
              };
              return visit(cache, 0);
            } catch {
              return '';
            }
          };
          const fromCache = fromApollo();
          if (fromCache) return fromCache;
          const slugOf = (href) => {
            const m = (href || '').match(/^\\/([A-Za-z0-9_-]{2,40})(\\/?$|\\?)/);
            return m ? ok(m[1]) : '';
          };
          const avatarLink = Array.from(document.querySelectorAll('a[href^="/"]'))
            .find((a) => a.querySelector('img'));
          const fromAvatar = slugOf(avatarLink?.getAttribute('href') || '');
          if (fromAvatar) return fromAvatar;
          for (const a of Array.from(document.querySelectorAll('a[href^="/"]'))) {
            const slug = slugOf(a.getAttribute('href') || '');
            if (slug) return slug;
          }
          return '';
        } catch { return ''; }
      })()`;
  }

  /** Cosmos auth uses `csms_*` JWTs; the other shapes are accepted because the cookie name isn't stable. */
  authCookies(name: string): boolean {
    return (
      name === "csms_accessToken" ||
      name === "csms_refreshToken" ||
      /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/.test(name) ||
      name === "__Secure-next-auth.session-token" ||
      name === "next-auth.session-token" ||
      name === "cosmos.session-token"
    );
  }

  handleFromPath(segments: Array<string>): string | null {
    const first = segments[0];
    if (!first) return null;
    if (COSMOS_RESERVED_ROOTS.has(first.toLowerCase())) return null;
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(first)) return null;
    return first;
  }

  readonly tests = [
    {
      url: "https://www.cosmos.so/jane/cluster-1",
      id: "jane/cluster-1",
      profile: { url: "https://www.cosmos.so/jane", handle: "jane" },
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("cosmos", input.url.href);
    if (!sourceId) throw new TerminalError("could not parse cosmos id");
    return captureFromSource({
      url: input.url.href,
      source: "cosmos",
      sourceId,
    });
  }
}
