import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { firstMatch, THREADS_PATTERNS } from "../url-patterns";

export class ThreadsPostExtractor implements Extractor {
  readonly id = "threads-post";
  readonly source = "threads" as const;
  readonly validUrl = THREADS_PATTERNS;
  readonly cookieDomain = ".threads.com";
  readonly probeExpression = `(() => {
        try {
          const link = document.querySelector('a[href^="/@"] img')?.closest('a') || document.querySelector('a[href^="/@"][role="link"]');
          const href = link?.getAttribute('href') || '';
          const m = href.match(/^\\/@([A-Za-z0-9._]+)/);
          if (m) return m[1];
          const scripts = Array.from(document.scripts).map((s) => s.textContent || '').join('\\n');
          const vm = scripts.match(/"username"\\s*:\\s*"([A-Za-z0-9._]+)"/);
          return vm ? vm[1] : '';
        } catch { return ''; }
      })()`;

  authCookies(name: string): boolean {
    return name === "sessionid";
  }

  handleFromPath(segments: Array<string>): string | null {
    const first = segments[0];
    if (!first) return null;
    if (first.startsWith("@")) return first.slice(1);
    if (!["t", "post", "login", "search"].includes(first)) return first;
    return null;
  }

  readonly tests = [
    {
      url: "https://www.threads.com/@zuck/post/C8Example01",
      id: "C8Example01",
      profile: { url: "https://www.threads.com/@zuck", handle: "zuck" },
    },
    {
      url: "https://www.threads.net/@mosseri/post/C8Example02",
      id: "C8Example02",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const match = firstMatch(input.url, this.validUrl);
    const code = match?.[1] ?? null;
    if (!code) throw new TerminalError("could not parse threads post code");
    const handleFromUrl = input.url.pathname.match(/\/@([^/]+)\//)?.[1];
    const canonical = handleFromUrl
      ? `https://www.threads.com/@${handleFromUrl}/post/${code}`
      : `https://www.threads.com/t/${code}`;
    return captureFromSource({
      url: canonical,
      source: "threads",
      sourceId: code,
    });
  }
}
