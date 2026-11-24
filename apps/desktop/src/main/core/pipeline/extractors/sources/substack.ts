import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { SUBSTACK_PATTERNS } from "../url-patterns";

export class SubstackPostExtractor implements Extractor {
  readonly id = "substack-post";
  readonly source = "substack" as const;
  readonly validUrl = SUBSTACK_PATTERNS;
  readonly cookieDomain = ".substack.com";
  readonly probeExpression = `(() => {
        try {
          const user = globalThis._preloads?.user;
          return user?.handle || (user?.id ? String(user.id) : '');
        } catch { return ''; }
      })()`;

  /** Anonymous visitors also get `substack.sid`; the sync confirms sign-in against the profile endpoint. */
  authCookies(name: string, value?: string): boolean {
    return name === "substack.sid" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first?.startsWith("@")) {
      return null;
    }
    const handle = first.slice(1);
    return /^[A-Za-z0-9_-]{1,64}$/.test(handle) ? handle : null;
  }

  readonly tests = [
    {
      url: "https://astralcodexten.substack.com/p/your-book-review",
      id: "astralcodexten.substack.com/p/your-book-review",
    },
    {
      url: "https://substack.com/@lenny/p-151234567",
      id: "p-151234567",
      profile: { url: "https://substack.com/@lenny", handle: "lenny" },
    },
    {
      url: "https://substack.com/home/post/p-151234567?utm_source=share",
      id: "p-151234567",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("substack", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse substack post");
    }
    const url = sourceId.startsWith("p-")
      ? `https://substack.com/home/post/${sourceId}`
      : `https://${sourceId}`;
    return captureFromSource({ url, source: "substack", sourceId });
  }
}
