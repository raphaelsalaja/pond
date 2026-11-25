import { marked } from "marked";

export interface TextDocument {
  format: "markdown" | "plain";
  title?: string;
  bodyHtml: string;
}

/** Converts a served text document into HTML so the rest of the pipeline can treat it as a page. */
export function convertTextDocument(
  text: string,
  format: "markdown" | "plain",
  url: string,
): TextDocument {
  /** SAFETY: `async: false` makes `marked.parse` return the rendered string synchronously. */
  const bodyHtml =
    format === "markdown"
      ? (marked.parse(text, { async: false }) as string)
      : `<pre>${escapeText(text)}</pre>`;
  return {
    format,
    title: documentTitle(bodyHtml, format, url),
    bodyHtml,
  };
}

/** A text document has no markup of its own, so the title comes from its first heading or its filename. */
function documentTitle(
  bodyHtml: string,
  format: "markdown" | "plain",
  url: string,
): string | undefined {
  if (format === "markdown") {
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(bodyHtml);
    const text = heading?.[1]?.replace(/<[^>]+>/g, "").trim();
    if (text) return decodeEntities(text);
  }
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    if (!segment) return undefined;
    const decoded = decodeURIComponent(segment);
    return decoded.replace(/\.(md|markdown|txt)$/i, "") || undefined;
  } catch {
    return undefined;
  }
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
