import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, INSTAGRAM_PATTERNS } from "../url-patterns";

export class InstagramPostExtractor implements Extractor {
  readonly id = "instagram-post";
  readonly source = "instagram" as const;
  readonly validUrl = INSTAGRAM_PATTERNS;
  readonly cookieDomain = ".instagram.com";
  /** The web app's viewer record comes first; the profile picture's alt text is English only. */
  readonly probeExpression = `(() => {
        try {
          const config = window.require && window.require('PolarisConfig');
          const viewer = config && config.getViewerData_DO_NOT_USE && config.getViewerData_DO_NOT_USE();
          const name = viewer && viewer.username;
          if (typeof name === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(name)) return name;
        } catch {}
        try {
          const img = document.querySelector('a[href^="/"] img[alt*="profile picture"]');
          const href = img?.closest('a')?.getAttribute('href') || '';
          const m = href.match(/^\\/([A-Za-z0-9._]+)\\/?$/);
          if (m) return m[1];
          const scripts = Array.from(document.scripts).map((s) => s.textContent || '').join('\\n');
          const vm = scripts.match(/"viewer"\\s*:\\s*\\{[^{}]*?"username"\\s*:\\s*"([A-Za-z0-9._]+)"/);
          return vm ? vm[1] : '';
        } catch { return ''; }
      })()`;

  authCookies(name: string): boolean {
    return name === "sessionid";
  }

  handleFromPath(segments: string[]): string | null {
    return segments[0] ?? null;
  }

  readonly tests = [
    {
      url: "https://www.instagram.com/p/CExample01/",
      id: "CExample01",
      profile: { url: "https://www.instagram.com/nasa/", handle: "nasa" },
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const code = match?.[1] ?? null;
    if (!code) throw new TerminalError("could not parse instagram code");
    const segment = /\/reels?\//i.test(input.url.href)
      ? "reel"
      : /\/tv\//i.test(input.url.href)
        ? "tv"
        : "p";
    return captureFromSource({
      url: `https://www.instagram.com/${segment}/${code}/`,
      source: "instagram",
      sourceId: code,
    });
  }
}
