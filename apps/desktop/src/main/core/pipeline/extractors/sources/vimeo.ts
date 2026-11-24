import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { VIMEO_PATTERNS } from "../url-patterns";

/** First-level Vimeo paths that are app routes, not users. */
const VIMEO_RESERVED = new Set([
  "_next",
  "_rv",
  "album",
  "api",
  "channels",
  "event",
  "groups",
  "home",
  "join",
  "library",
  "log_in",
  "manage",
  "ondemand",
  "settings",
  "showcase",
  "upload",
  "watch",
  "watchlater",
]);

export class VimeoVideoExtractor implements Extractor {
  readonly id = "vimeo-video";
  readonly source = "vimeo" as const;
  readonly validUrl = VIMEO_PATTERNS;
  readonly cookieDomain = ".vimeo.com";
  readonly probeExpression = `(() => {
        try {
          const raw = document.getElementById('__NEXT_DATA__')?.textContent;
          const user = raw ? JSON.parse(raw)?.props?.pageProps?.viewerBootstrap?.user : null;
          const link = user?.link || user?.url || '';
          return link ? link.split('/').filter(Boolean).pop() : '';
        } catch { return ''; }
      })()`;

  /** yt-dlp treats the `vimeo` cookie as the session; visitors only get `vuid` and Cloudflare cookies. */
  authCookies(name: string, value?: string): boolean {
    return name === "vimeo" && (value === undefined || value.length > 0);
  }

  handleFromPath(segments: Array<string>): string | null {
    const [first] = segments;
    if (segments.length !== 1 || !first) {
      return null;
    }
    if (VIMEO_RESERVED.has(first.toLowerCase()) || /^\d+$/.test(first)) {
      return null;
    }
    return /^[A-Za-z0-9_-]{2,64}$/.test(first) ? first : null;
  }

  readonly tests = [
    {
      url: "https://vimeo.com/76979871",
      id: "76979871",
      profile: { url: "https://vimeo.com/user755559", handle: "user755559" },
    },
    {
      url: "https://player.vimeo.com/video/76979871?h=8272103f6e",
      id: "76979871",
    },
    { url: "https://vimeo.com/channels/staffpicks/76979871", id: "76979871" },
    { url: "https://vimeo.com/76979871/8272103f6e", id: "76979871" },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("vimeo", input.url.href);
    if (!sourceId) {
      throw new TerminalError("could not parse vimeo video");
    }
    return captureFromSource({
      url: `https://vimeo.com/${sourceId}`,
      source: "vimeo",
      sourceId,
    });
  }
}
