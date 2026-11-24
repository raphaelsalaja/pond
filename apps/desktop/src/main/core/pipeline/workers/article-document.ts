import type { Capture, CaptureArticle } from "@pond/schema/raw";
import { ARTICLE_FILE, ARTICLE_KIND } from "@shared/save-file-names";
import type { WriteFileArgs } from "./apply";

interface ArticleWrite {
  newFiles?: Array<WriteFileArgs>;
  replaceFilesWithKind?: WriteFileArgs["kind"];
}

interface SplitArticle {
  capture: Capture;
  files: ArticleWrite;
}

/** Moves the post body off the capture so `rawJson` stays small, and into its own file. */
export function splitArticle(harvested: Capture): SplitArticle {
  const { article, ...capture } = harvested;
  if (!article) {
    return { capture, files: {} };
  }
  return {
    capture,
    files: {
      newFiles: [
        {
          kind: ARTICLE_KIND,
          filename: ARTICLE_FILE,
          mimeType: "text/html",
          bytes: Buffer.from(articleDocument(capture, article), "utf8"),
        },
      ],
      replaceFilesWithKind: ARTICLE_KIND,
    },
  };
}

/** The reader takes its header from these `pond:*` meta tags, so the file stands alone. */
function articleDocument(capture: Capture, article: CaptureArticle): string {
  const meta = new Map<string, string | undefined>([
    ["pond:title", capture.title],
    ["pond:subtitle", article.subtitle],
    ["pond:author", capture.author?.name ?? capture.author?.handle],
    ["pond:author-photo", capture.author?.avatarUrl],
    ["pond:publication", capture.extras?.publisher],
    ["pond:published", capture.publishedAt],
    ["pond:url", article.canonicalUrl ?? capture.url],
    ["pond:cover", capture.media.find((m) => m.type === "image")?.url],
    ["pond:preview", article.preview ? "true" : undefined],
  ]);
  const tags = [...meta].flatMap(([name, content]) =>
    content
      ? [`<meta name="${name}" content="${escapeAttribute(content)}">`]
      : [],
  );
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${escapeText(capture.title ?? "")}</title>`,
    ...tags,
    "</head><body>",
    article.html,
    "</body></html>",
  ].join("\n");
}

function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeText(text).replaceAll('"', "&quot;");
}
