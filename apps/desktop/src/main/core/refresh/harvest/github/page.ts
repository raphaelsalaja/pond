import type { JsonObject } from "@pond/schema/json";
import { load } from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";

/** Long enough for search and Fish to read a README, short enough to keep the save row small. */
const TEXT_LIMIT = 12_000;

/** innerText adds the line breaks textContent skips, and `<pre>` keeps its own whitespace. */
const LINE_BREAK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

const SKIPPED_TAGS = new Set(["script", "style", "template", "noscript"]);

/**
 * Reads a server-rendered repository page into the same blob the in-page
 * harvest returns, so one `adapt` serves both paths. Resolves null when the
 * page carries no repository meta, which is how GitHub answers a missing or
 * private repository and most interstitial variants.
 */
export function parseRepoPage(
  html: string,
  pageUrl: string,
): JsonObject | null {
  const $ = load(html);
  const meta = (name: string): string =>
    $(`meta[property="${name}"], meta[name="${name}"]`)
      .first()
      .attr("content")
      ?.trim() ?? "";

  const name = meta("octolytics-dimension-repository_nwo");
  if (!name.includes("/")) return null;
  const owner = name.split("/")[0] ?? "";

  const aboutHeading = $("h2")
    .toArray()
    .find((heading) => $(heading).text().trim() === "About");
  const section = aboutHeading ? $(aboutHeading).parent() : null;
  const about = section?.find("p").first().text().trim() ?? "";
  const topics = (section?.find('a[href^="/topics/"]').toArray() ?? [])
    .map((a) => $(a).text().trim())
    .filter(Boolean);
  const homepage = (section?.find("a[href^='http']").toArray() ?? [])
    .map((a) => resolveUrl($(a).attr("href"), pageUrl))
    .find(
      (href) =>
        href !== undefined && !/^https?:\/\/([^/]+\.)?github\.com\b/.test(href),
    );

  const article = readmeArticle($);
  const readmeText = article ? renderedText(article) : "";

  const text = [
    about,
    topics.length > 0 ? `Topics: ${topics.join(", ")}` : "",
    readmeText,
  ]
    .filter(Boolean)
    .join("\n\n");

  const page: JsonObject = {
    title: name,
    author: owner,
    mediaUrls: openGraphImages($),
    meta: {
      authorName: owner,
      authorUrl: `https://github.com/${owner}`,
      authorAvatar: `https://github.com/${owner}.png`,
    },
  };
  if (text) {
    page.description =
      text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
  }
  if (homepage) page.homepage = homepage;
  if (article) {
    const readme = readmeHtml($, article, pageUrl);
    if (readme) page.readme = readme;
  }
  return page;
}

function readmeArticle($: CheerioAPI): Cheerio<Element> | null {
  const found = $("article.markdown-body").first();
  return found.length > 0 ? found : null;
}

function openGraphImages($: CheerioAPI): Array<JsonObject> {
  return $('meta[property="og:image"], meta[name="og:image"]')
    .toArray()
    .map((element) => $(element).attr("content")?.trim() ?? "")
    .filter((url) => url.length > 0)
    .map((url) => ({ url, type: "image" }));
}

/**
 * Approximates innerText for a README: block elements break lines, `<pre>`
 * keeps its whitespace, and script or style content never leaks into the text.
 */
function renderedText(article: Cheerio<Element>): string {
  const chunks: Array<string> = [];
  const walk = (node: AnyNode, inPre: boolean): void => {
    if (node.type === "text") {
      chunks.push(inPre ? node.data : node.data.replaceAll(/\s+/g, " "));
      return;
    }
    if (node.type !== "tag") return;
    const tag = node.name.toLowerCase();
    if (SKIPPED_TAGS.has(tag)) return;
    if (tag === "br") {
      chunks.push("\n");
      return;
    }
    const breaks = LINE_BREAK_TAGS.has(tag);
    if (breaks) chunks.push("\n");
    for (const child of node.children) walk(child, inPre || tag === "pre");
    if (breaks) chunks.push("\n");
  };
  for (const child of article.get(0)?.children ?? []) walk(child, false);
  return chunks
    .join("")
    .replaceAll(/ *\n */g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/** Mutates the disposable parse tree; there is no live page to protect. */
function readmeHtml(
  $: CheerioAPI,
  article: Cheerio<Element>,
  pageUrl: string,
): string {
  article.find(".zeroclipboard-container, clipboard-copy").remove();
  article.find("a.anchor").each((_, anchor) => {
    const a = $(anchor);
    const heading = a.parent().find("h1, h2, h3, h4, h5, h6").first();
    const id = a.attr("id");
    if (heading.length > 0 && id && !heading.attr("id")) {
      heading.attr("id", id);
    }
    a.remove();
  });
  const ids = new Set(
    article
      .find("[id]")
      .toArray()
      .map((element) => $(element).attr("id")),
  );
  article.find("a[href]").each((_, link) => {
    const href = $(link).attr("href") ?? "";
    if (href.startsWith("#")) {
      const target = `user-content-${href.slice(1)}`;
      if (ids.has(target)) $(link).attr("href", `#${target}`);
      return;
    }
    const resolved = resolveUrl(href, pageUrl);
    if (resolved) $(link).attr("href", resolved);
  });
  article.find("img[src]").each((_, img) => {
    const resolved = resolveUrl($(img).attr("src"), pageUrl);
    if (resolved) $(img).attr("src", resolved);
  });
  return article.html() ?? "";
}

function resolveUrl(
  href: string | undefined,
  base: string,
): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}
