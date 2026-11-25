import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, GITHUB_PATTERNS } from "../url-patterns";

const RESERVED_ROOTS = new Set([
  "about",
  "explore",
  "features",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "search",
  "settings",
  "signup",
  "sponsors",
  "topics",
  "trending",
]);

export class GitHubRepoExtractor implements Extractor {
  readonly id = "github-repo";
  readonly source = "github" as const;
  readonly validUrl = GITHUB_PATTERNS;
  readonly cookieDomain = ".github.com";
  readonly probeExpression = `(() => {
        try {
          return document.querySelector('meta[name="user-login"]')?.getAttribute('content') || '';
        } catch { return ''; }
      })()`;

  authCookies(name: string, value?: string): boolean {
    if (name === "user_session") return value === undefined || value.length > 0;
    if (name === "logged_in") return value === undefined || value === "yes";
    return false;
  }

  /** Only a bare profile path names you; `owner/repo` belongs to whoever you starred. */
  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) return null;
    if (RESERVED_ROOTS.has(first.toLowerCase())) return null;
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(first) ? first : null;
  }

  readonly tests = [
    { url: "https://github.com/vercel/next.js", id: "vercel/next.js" },
    { url: "https://github.com/raphaelsalaja/pond/", id: "raphaelsalaja/pond" },
    {
      url: "https://github.com/octocat/hello-world.git",
      id: "octocat/hello-world",
      profile: { url: "https://github.com/octocat", handle: "octocat" },
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const repo = firstMatch(input.url, this.validUrl)?.[1]?.toLowerCase();
    if (!repo) throw new TerminalError("could not parse github repo");
    return captureFromSource({
      url: `https://github.com/${repo}`,
      source: "github",
      sourceId: repo,
    });
  }
}
