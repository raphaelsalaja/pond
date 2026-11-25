import { isLoggedInRedditToken } from "../../../../lib/reddit-token";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, REDDIT_PATTERNS } from "../url-patterns";

export class RedditPostExtractor implements Extractor {
  readonly id = "reddit-post";
  readonly source = "reddit" as const;
  readonly validUrl = REDDIT_PATTERNS;
  readonly cookieDomain = ".reddit.com";
  readonly probeExpression = `(() => {
        try {
          const app = document.querySelector('shreddit-app');
          const fromApp = app?.getAttribute('user') || app?.getAttribute('username') || '';
          if (fromApp && fromApp !== 'null') return fromApp.replace(/^u\\//, '');
          const link = document.querySelector('a[href^="/user/"][id*="expand-user-drawer"], a#expand-user-drawer-button, faceplate-tracker[noun="account"] a[href^="/user/"]');
          const href = link?.getAttribute('href') || '';
          const m = href.match(/^\\/user\\/([^/?#]+)/i);
          if (m) return decodeURIComponent(m[1]);
          return '';
        } catch { return ''; }
      })()`;

  authCookies(name: string, value?: string): boolean {
    if (name === "reddit_session") {
      return value === undefined || value.length > 0;
    }
    if (name === "token_v2") {
      return value ? isLoggedInRedditToken(value) : false;
    }
    return false;
  }

  handleFromPath(segments: Array<string>): string | null {
    if ((segments[0] === "user" || segments[0] === "u") && segments[1]) {
      return segments[1];
    }
    if (
      segments.length === 1 &&
      segments[0] &&
      !["r", "user", "u", "comments", "login", "register"].includes(segments[0])
    ) {
      return segments[0];
    }
    return null;
  }

  readonly tests = [
    {
      url: "https://www.reddit.com/r/pics/comments/abc123/a_nice_photo/",
      id: "abc123",
      profile: { url: "https://www.reddit.com/user/spez/", handle: "spez" },
    },
    { url: "https://redd.it/abc123", id: "abc123" },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const postId = match?.[1] ?? null;
    if (!postId) throw new TerminalError("could not parse reddit post id");
    return captureFromSource({
      url: input.url.href,
      source: "reddit",
      sourceId: postId,
    });
  }
}
