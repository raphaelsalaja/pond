import { createHash } from "node:crypto";
import { SHARE_PAGE_MANIFEST_ID } from "@pond/schema/share-page";
import type { SharePageManifest } from "@pond/schema/share-page";

export interface SharePageViewer {
  script: string;
  style: string;
}

/**
 * The viewer and its styles are inlined and allowed by hash, so the page runs no script
 * but its own, works from disk, and needs nothing from any server but its media.
 */
export interface SharePageHtmlOptions {
  /** The page's public address. With it, links to the page unfurl in chat apps; a page on disk has none. */
  pageUrl?: string;
}

export function sharePageHtml(
  manifest: SharePageManifest,
  viewer: SharePageViewer,
  options: SharePageHtmlOptions = {},
): string {
  if (/<\/script/i.test(viewer.script) || /<\/style/i.test(viewer.style)) {
    throw new Error("The Share Page viewer can't be inlined.");
  }
  const policy = [
    "default-src 'none'",
    `script-src 'sha256-${sha256(viewer.script)}'`,
    `style-src 'sha256-${sha256(viewer.style)}'`,
    "img-src 'self' data:",
    "media-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="generator" content="Pond">',
    `<title>${escapeHtml(manifest.title)}</title>`,
    ...(options.pageUrl ? previewTags(manifest, options.pageUrl) : []),
    `<style>${viewer.style}</style>`,
    "</head>",
    "<body>",
    '<div id="root"></div>',
    `<script type="application/json" id="${SHARE_PAGE_MANIFEST_ID}">${manifestJson(manifest)}</script>`,
    `<script>${viewer.script}</script>`,
    "<noscript>Turn on JavaScript to see this page.</noscript>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** `<` can't appear raw inside a script element, or a title like `</script>` would end it. */
function manifestJson(manifest: SharePageManifest): string {
  return JSON.stringify(manifest)
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`);
}

/** Open Graph tags. Only the title, a count, and one card image: what any visitor sees first anyway. */
function previewTags(
  manifest: SharePageManifest,
  pageUrl: string,
): Array<string> {
  const count = manifest.saves.length;
  const description = count === 1 ? "1 Save" : `${count} Saves`;
  const thumbnail = manifest.saves.find((save) => save.thumbnail)?.thumbnail;
  const tags = [
    ["og:type", "website"],
    ["og:title", manifest.title],
    ["og:description", description],
    ["og:url", pageUrl],
    ...(thumbnail
      ? [
          ["og:image", new URL(thumbnail.src, pageUrl).href],
          ["og:image:width", String(thumbnail.width)],
          ["og:image:height", String(thumbnail.height)],
        ]
      : []),
  ];
  return [
    ...tags.map(
      ([property, content]) =>
        `<meta property="${property}" content="${escapeHtml(content ?? "")}">`,
    ),
    `<meta name="twitter:card" content="${thumbnail ? "summary_large_image" : "summary"}">`,
  ];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
