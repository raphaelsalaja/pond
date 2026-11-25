import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromSource } from "../../../refresh/harvest/capture";
import { TerminalError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { MARKED_PATTERNS } from "../url-patterns";

export class MarkedRefExtractor implements Extractor {
  readonly id = "marked-ref";
  readonly source = "marked" as const;
  readonly validUrl = MARKED_PATTERNS;
  readonly cookieDomain = ".marked.dev";
  readonly probeExpression = `(async () => {
        try {
          const res = await fetch('/api/data/getSession', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ args: [] }),
          });
          if (!res.ok) return '';
          const user = (await res.json())?.data?.user;
          if (typeof user?.name === 'string' && user.name.trim()) return user.name.trim();
          return typeof user?.id === 'string' ? user.id : '';
        } catch { return ''; }
      })()`;

  /** Clerk sets `__client_uat` for visitors too, with `0` until someone signs in. */
  authCookies(name: string, value?: string): boolean {
    if (!/^__client_uat(?:_[\w-]+)?$/.test(name)) return false;
    return value === undefined || (value.length > 0 && value !== "0");
  }

  readonly tests = [
    {
      url: "https://marked.dev/ref/55c95cf4-a3d8-5a58-a390-8912b842e6fb",
      id: "55c95cf4-a3d8-5a58-a390-8912b842e6fb",
    },
    {
      url: "https://www.marked.dev/ref/44b42846-9904-5d01-95c9-af0cf0f56281?from=explore",
      id: "44b42846-9904-5d01-95c9-af0cf0f56281",
    },
  ];

  suitable(url: URL): boolean {
    return this.validUrl.some((rx) => rx.test(url.href));
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const sourceId = sourceIdFromUrl("marked", input.url.href);
    if (!sourceId) throw new TerminalError("could not parse marked ref");
    return captureFromSource({
      url: `https://marked.dev/ref/${sourceId}`,
      source: "marked",
      sourceId,
    });
  }
}
