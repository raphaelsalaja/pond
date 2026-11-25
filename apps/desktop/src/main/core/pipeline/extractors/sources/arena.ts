import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { ARENA_PATTERNS, firstMatch } from "../url-patterns";

const ARENA_RESERVED_ROOTS = new Set([
  "block",
  "blocks",
  "about",
  "blog",
  "log-in",
  "login",
  "sign-up",
  "signup",
  "channels",
  "search",
  "explore",
  "feed",
  "index",
  "me",
  "notifications",
  "messages",
  "pricing",
  "jobs",
  "privacy",
  "terms",
  "team",
  "press",
  "help",
  "support",
  "settings",
]);

export class ArenaBlockExtractor implements Extractor {
  readonly id = "arena-block";
  readonly source = "arena" as const;
  readonly validUrl = ARENA_PATTERNS;
  readonly cookieDomain = ".are.na";
  readonly probeExpression = `(() => {
        try {
          const reserved = ['block','blocks','about','blog','log-in','login','sign-up','signup','channels','search','explore','feed','index','me','notifications','messages','pricing','jobs','privacy','terms','team','press','help','support','settings'];
          const slugOf = (href) => {
            const m = (href || '').match(/^\\/([a-z0-9][a-z0-9-]*)(\\/?$|\\/|\\?.*$)/i);
            if (!m) return '';
            const slug = m[1];
            return reserved.includes(slug.toLowerCase()) ? '' : slug;
          };
          /** Most reliable: the signed-in header shows the user's own avatar, wrapped in a link to /<their-slug>. */
          const avatarLink = Array.from(document.querySelectorAll('a[href^="/"]'))
            .find((a) => a.querySelector('img[src*="avatars.are.na"]'));
          const fromAvatar = slugOf(avatarLink?.getAttribute('href') || '');
          if (fromAvatar) return fromAvatar;
          for (const a of Array.from(document.querySelectorAll('a[href^="/"]'))) {
            const slug = slugOf(a.getAttribute('href') || '');
            if (slug) return slug;
          }
          return '';
        } catch { return ''; }
      })()`;

  authCookies(name: string): boolean {
    return (
      name === "sander-iron-session" ||
      name === "_arena_session" ||
      name === "remember_user_token"
    );
  }

  handleFromPath(segments: Array<string>): string | null {
    const first = segments[0];
    if (!first) return null;
    if (ARENA_RESERVED_ROOTS.has(first.toLowerCase())) return null;
    /** are.na slugs are lowercase alphanumerics + hyphens; anything else is a display name, not a slug. */
    if (!/^[a-z0-9][a-z0-9-]*$/.test(first)) return null;
    return first;
  }

  readonly tests = [
    {
      url: "https://www.are.na/block/12345",
      id: "12345",
      profile: { url: "https://www.are.na/some-user", handle: "some-user" },
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const blockId = match?.[1] ?? null;
    if (!blockId) throw new TerminalError("could not parse arena block id");

    return captureFromSource({
      url: input.url.href,
      source: "arena",
      sourceId: blockId,
    });
  }
}
