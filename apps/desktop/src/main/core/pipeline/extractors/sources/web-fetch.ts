import { browserUserAgent } from "../../../refresh/web-page-renderer";
import { TerminalError, TransientError } from "../errors";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * undici caps response headers at 16 KiB. YouTube sends more than that, so the
 * plain fetch fails with UND_ERR_HEADERS_OVERFLOW before any body arrives. A
 * real browser has no such cap, so report "no html" and let the caller render.
 */
const HEADERS_OVERFLOW = "UND_ERR_HEADERS_OVERFLOW";

/**
 * Fetches a page as HTML without a browser. Resolves null on 403: bot walls
 * fingerprint the TLS handshake, so only a real browser gets through.
 */
export async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": browserUserAgent(),
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? err.cause : null;
    const code =
      cause instanceof Error && "code" in cause ? String(cause.code) : null;
    if (code === HEADERS_OVERFLOW) return null;
    const message = err instanceof Error ? err.message : String(err);
    throw new TransientError(
      `web fetch failed: ${message}${code ? ` (${code})` : ""}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403) return null;
  assertPageStatus(res.status, "web fetch");

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|xml|xhtml/i.test(contentType)) {
    throw new TerminalError(`web fetch non-html content-type: ${contentType}`);
  }

  const text = await res.text();
  if (!text.trim()) throw new TerminalError("web fetch returned empty body");
  return text;
}

function assertPageStatus(status: number, label: string): void {
  if (status < 400) return;
  if (status >= 500 || status === 429) {
    throw new TransientError(`${label} ${status}`);
  }
  throw new TerminalError(`${label} ${status}`);
}
