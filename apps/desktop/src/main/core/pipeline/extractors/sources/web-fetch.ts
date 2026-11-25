import { browserUserAgent } from "../../../refresh/web-page-renderer";
import { TerminalError, TransientError } from "../errors";
import { convertTextDocument } from "./text-document";
import type { TextDocument } from "./text-document";

const FETCH_TIMEOUT_MS = 15_000;

/** Text documents and pages are metadata inputs, not media; anything larger is a download the pipeline never asked for. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

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
export async function fetchHtml(
  url: string,
  request: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<FetchHtmlSuccess | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await request(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": browserUserAgent(),
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (error) {
    const cause =
      error instanceof Error && "cause" in error ? error.cause : null;
    const code =
      cause instanceof Error && "code" in cause ? String(cause.code) : null;
    if (code === HEADERS_OVERFLOW) {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new TransientError(
      `web fetch failed: ${message}${code ? ` (${code})` : ""}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403) {
    return null;
  }
  assertPageStatus(res.status, "web fetch");

  const contentType = res.headers.get("content-type") ?? "";
  const format = textDocumentFormat(contentType, url);
  if (!format && contentType && !/text\/html|xml|xhtml/i.test(contentType)) {
    throw new TerminalError(`web fetch non-html content-type: ${contentType}`);
  }

  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    throw new TerminalError(`web fetch body too large: ${length} bytes`);
  }
  const text = await readBodyCapped(res);
  if (!text.trim()) {
    throw new TerminalError("web fetch returned empty body");
  }
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
  if (/text\/markdown/i.test(contentType)) {
    return "markdown";
  }
  if (!/text\/plain/i.test(contentType)) {
    return null;
  }
  try {
    if (/\.(md|markdown)$/i.test(new URL(url).pathname)) {
      return "markdown";
    }
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
    `<title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>`,
    "</head><body>",
    document.bodyHtml,
    "</body></html>",
  ].join("\n");
}

/** Content-Length is advisory and often absent, so the body is counted as it streams. */
async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) {
    return res.text();
  }
  const reader = res.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value?.byteLength ?? 0;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new TerminalError(
        `web fetch body exceeded ${MAX_BODY_BYTES} bytes`,
      );
    }
    if (value) {
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function assertPageStatus(status: number, label: string): void {
  if (status < 400) {
    return;
  }
  if (status >= 500 || status === 429) {
    throw new TransientError(`${label} ${status}`);
  }
  throw new TerminalError(`${label} ${status}`);
}
