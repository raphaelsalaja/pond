import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { blogFromUrl } from "../../../refresh/harvest/tumblr/normalize";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { TUMBLR_PATTERNS } from "../url-patterns";

/** First-level `www.tumblr.com` paths that are app routes, not blogs. */
const TUMBLR_RESERVED = new Set([
  "about",
  "activity",
  "apps",
  "blog",
  "communities",
  "dashboard",
  "docs",
  "explore",
  "following",
  "help",
  "inbox",
  "likes",
  "login",
  "logout",
  "messages",
  "new",
  "policy",
  "privacy",
  "register",
  "search",
  "settings",
  "tagged",
]);

export class TumblrPostExtractor implements Extractor {
  readonly id = "tumblr-post";
  readonly source = "tumblr" as const;
  readonly validUrl = TUMBLR_PATTERNS;
  readonly cookieDomain = ".tumblr.com";
  readonly probeExpression = `(() => {
        try {
          const raw = document.getElementById('___INITIAL_STATE___')?.textContent;
          const state = raw ? JSON.parse(raw) : null;
          const query = state?.queries?.queries?.find((q) => q?.queryKey?.[0] === 'user-info');
          const user = (query?.state?.data ?? query?.data)?.user;
          const blogs = Array.isArray(user?.blogs) ? user.blogs : [];
          return (blogs.find((b) => b?.primary) ?? blogs[0])?.name || user?.name || '';
        } catch { return ''; }
      })()`;

  authCookies(name: string, value?: string): boolean {
    return name === "sid" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) {
      return null;
    }
    const blog = first.toLowerCase();
    if (TUMBLR_RESERVED.has(blog)) {
      return null;
    }
    return /^[a-z0-9-]{1,32}$/.test(blog) ? blog : null;
  }

  readonly tests = [
    {
      url: "https://www.tumblr.com/pascalcampion/178735553447/looking-for-inspiration-pascalcampion",
      id: "178735553447",
      profile: {
        url: "https://www.tumblr.com/pascalcampion",
        handle: "pascalcampion",
      },
    },
    {
      url: "https://pascalcampion.tumblr.com/post/178735553447/looking-for-inspiration",
      id: "178735553447",
    },
    {
      url: "https://www.tumblr.com/blog/view/pascalcampion/178735553447",
      id: "178735553447",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("tumblr", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse tumblr post");
    }
    const blog = blogFromUrl(input.url.href);
    /** Blog subdomains sit behind a bot wall, so the window fallback reads the `www` permalink instead. */
    const url = blog
      ? `https://www.tumblr.com/${blog}/${sourceId}`
      : input.url.href;
    return captureFromSource({ url, source: "tumblr", sourceId });
  }
}
