import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, YOUTUBE_PATTERNS } from "../url-patterns";

export class YouTubeWatchExtractor implements Extractor {
  readonly id = "youtube-watch";
  readonly source = "youtube" as const;
  readonly validUrl = YOUTUBE_PATTERNS;
  readonly cookieDomain = ".youtube.com";
  /** The account page rarely prints the handle, so this asks the avatar menu's InnerTube call first, then polls the page. */
  readonly probeExpression = `(async () => {
        const fromMenu = async () => {
          const cfg = globalThis.ytcfg;
          const context = cfg?.get?.('INNERTUBE_CONTEXT');
          const sapisid = (document.cookie.match(/(?:^|;\\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/) || [])[1];
          if (!context || !sapisid) return '';
          const ts = Math.floor(Date.now() / 1000);
          const digest = await crypto.subtle.digest(
            'SHA-1',
            new TextEncoder().encode(ts + ' ' + sapisid + ' ' + location.origin),
          );
          const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
          const res = await fetch('/youtubei/v1/account/account_menu?prettyPrint=false', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type': 'application/json',
              authorization: 'SAPISIDHASH ' + ts + '_' + hex,
              'x-origin': location.origin,
              'x-goog-authuser': String(cfg.get('SESSION_INDEX') ?? 0),
            },
            body: JSON.stringify({ context }),
          });
          if (!res.ok) return '';
          const body = await res.text();
          const m =
            body.match(/"channelHandle":\\{"simpleText":"@([A-Za-z0-9._-]{3,30})"/) ||
            body.match(/"canonicalBaseUrl":"\\/@([A-Za-z0-9._-]{3,30})"/);
          return m ? m[1] : '';
        };
        try {
          const handle = await fromMenu();
          if (handle) return handle;
        } catch {}
        const find = () => {
          const path = location.pathname.match(/^\\/@([A-Za-z0-9._-]{3,30})/);
          if (path) return path[1];
          const data = JSON.stringify(globalThis.ytInitialData ?? '')
            .match(/"canonicalBaseUrl":"\\/@([A-Za-z0-9._-]{3,30})"/);
          if (data) return data[1];
          const text = (document.body?.innerText || '').match(/(^|\\s)@([A-Za-z0-9._-]{3,30})/);
          return text ? text[2] : '';
        };
        for (let i = 0; i < 16; i++) {
          try {
            const handle = find();
            if (handle) return handle;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return '';
      })()`;

  authCookies(name: string): boolean {
    /** SID / PSID appear during Google SSO before YouTube itself is signed in. */
    return name === "LOGIN_INFO";
  }

  readonly tests = [
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", id: "dQw4w9WgXcQ" },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const videoId = match?.[1] ?? null;
    if (!videoId) throw new TerminalError("could not parse youtube id");
    return captureFromSource({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: "youtube",
      sourceId: videoId,
    });
  }
}
