import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { UNSPLASH_PATTERNS } from "../url-patterns";

export class UnsplashAssetExtractor implements Extractor {
  readonly id = "unsplash-asset";
  readonly source = "unsplash" as const;
  readonly validUrl = UNSPLASH_PATTERNS;
  readonly cookieDomain = ".unsplash.com";
  readonly probeExpression = `(async () => {
        try {
          const res = await fetch('/napi/me', { credentials: 'include', headers: { accept: 'application/json' } });
          if (!res.ok) return '';
          const me = await res.json();
          return typeof me?.username === 'string' ? me.username : '';
        } catch { return ''; }
      })()`;

  /** `un_sesh` also appears for visitors in some dumps; `auth_user_id` only exists signed in. */
  authCookies(name: string, value?: string): boolean {
    return name === "auth_user_id" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first?.startsWith("@")) {
      return null;
    }
    const handle = first.slice(1);
    return /^[A-Za-z0-9_]{1,40}$/.test(handle) ? handle : null;
  }

  readonly tests = [
    {
      url: "https://unsplash.com/photos/two-women-in-oversized-shirts-with-files-and-phone-p_1H2gI1-KA",
      id: "p_1H2gI1-KA",
      profile: { url: "https://unsplash.com/@lishakov", handle: "lishakov" },
    },
    { url: "https://unsplash.com/photos/p_1H2gI1-KA", id: "p_1H2gI1-KA" },
    {
      url: "https://unsplash.com/illustrations/happy-birthday-text-on-polka-dots-uxb5un3ou3k",
      id: "uxb5un3ou3k",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("unsplash", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse unsplash photo");
    }
    return captureFromSource({
      url: `https://unsplash.com/photos/${sourceId}`,
      source: "unsplash",
      sourceId,
    });
  }
}
