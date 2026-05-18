import log from "electron-log/main.js";
import { RateLimitedError, TerminalError, TransientError } from "../errors";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface FetchHtmlOptions {
  timeoutMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export async function fetchHtmlPlain(
  url: string,
  opts: FetchHtmlOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...opts.headers,
      },
    });
  } catch (err) {
    throw new TransientError(`fetchHtmlPlain network error: ${String(err)}`);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "");
    throw new RateLimitedError(Number.isFinite(retry) ? retry : undefined);
  }
  if (res.status >= 500) {
    throw new TransientError(`fetchHtmlPlain http ${res.status}`);
  }
  if (res.status === 404 || res.status === 410) {
    throw new TerminalError(`fetchHtmlPlain http ${res.status}`);
  }
  if (!res.ok) {
    throw new TransientError(`fetchHtmlPlain http ${res.status}`);
  }
  try {
    return await res.text();
  } catch (err) {
    throw new TransientError(`fetchHtmlPlain body read error: ${String(err)}`);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchHtmlOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        accept: "application/json,*/*;q=0.8",
        ...opts.headers,
      },
    });
  } catch (err) {
    throw new TransientError(`fetchJson network error: ${String(err)}`);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "");
    throw new RateLimitedError(Number.isFinite(retry) ? retry : undefined);
  }
  if (res.status >= 500) {
    throw new TransientError(`fetchJson http ${res.status}`);
  }
  if (res.status === 404 || res.status === 410) {
    throw new TerminalError(`fetchJson http ${res.status}`);
  }
  if (!res.ok) {
    throw new TransientError(`fetchJson http ${res.status}`);
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    log.warn("[pond extractor] fetchJson parse failed", url, err);
    throw new TransientError(`fetchJson parse error: ${String(err)}`);
  }
}
