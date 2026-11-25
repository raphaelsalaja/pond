import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, TWITTER_PATTERNS } from "../url-patterns";

export class TwitterTweetExtractor implements Extractor {
  readonly id = "twitter-tweet";
  readonly source = "twitter" as const;
  readonly validUrl = TWITTER_PATTERNS;
  readonly cookieDomain = ".x.com";
  /** The signed-in left nav's Profile tab links to /<handle>; x-web dropped the test id, so fall back to the nav link's label. */
  readonly probeExpression = `(() => {
        try {
          const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"], nav a[aria-label="Profile"]');
          const m = (a?.getAttribute('href') || '').match(/^\\/([A-Za-z0-9_]+)\\/?$/);
          return m ? m[1] : '';
        } catch { return ''; }
      })()`;

  authCookies(name: string): boolean {
    return name === "auth_token";
  }

  readonly tests = [{ url: "https://x.com/jack/status/20", id: "20" }];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const tweetId = match?.[1] ?? null;
    if (!tweetId) {
      throw new TerminalError("could not parse tweet id");
    }
    return captureFromSource({
      url: `https://x.com/i/web/status/${tweetId}`,
      source: "twitter",
      sourceId: tweetId,
    });
  }
}
