import { browserUserAgent } from "../../../refresh/web-page-renderer";
import { TerminalError, TransientError } from "../errors";
import { convertTextDocument, type TextDocument } from "./text-document";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * undici caps response headers at 16 KiB. YouTube sends more than that, so the
 * plain fetch fails with UND_ERR_HEADERS_OVERFLOW before any body arrives. A
 * real browser has no such cap, so report "no html" and let the caller render.
 */
const HEADERS_OVERFLOW = "UND_ERR_HEADERS_OVERFLOW";

export interface FetchHtmlSuccess {
  html: string;
  /** The URL served a text document; `html` is its converted rendering. */
  document?: TextDocument;
}

/**
 * Fetches a page as HTML without a browser. Resolves null on 403: bot walls
 * fingerprint the TLS handshake, so only a real browser gets through.
 */
export async function fetchHtml(url: string): Promise<FetchHtmlSuccess | null> {
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
  const format = textDocumentFormat(contentType, url);
  if (!format && contentType && !/text\/html|xml|xhtml/i.test(contentType)) {
    throw new TerminalError(`web fetch non-html content-type: ${contentType}`);
  }

  const text = await res.text();
  if (!text.trim()) throw new TerminalError("web fetch returned empty body");
  if (format) {
    const document = convertTextDocument(text, format, url);
    return { html: wrapDocument(document), document };
  }
  return { html: text };
}

/** Markdown served as plain text still parses as markdown when the URL names it. */
function textDocumentFormat(
  contentType: string,
  url: string,
): "markdown" | "plain" | null {
  if (/text\/markdown/i.test(contentType)) return "markdown";
  if (!/text\/plain/i.test(contentType)) return null;
  try {
    if (/\.(md|markdown)$/i.test(new URL(url).pathname)) return "markdown";
  } catch {
    /* The URL already parsed for the fetch itself. */
  }
  return "plain";
}

/** Metascraper reads the title and metadata off the document shell, so the conversion carries it. */
function wrapDocument(document: TextDocument): string {
  const title = document.title ?? "";
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>`,
    "</head><body>",
    document.bodyHtml,
    "</body></html>",
  ].join("\n");
}

function assertPageStatus(status: number, label: string): void {
  if (status < 400) return;
  if (status >= 500 || status === 429) {
    throw new TransientError(`${label} ${status}`);
  }
  throw new TerminalError(`${label} ${status}`);
}
