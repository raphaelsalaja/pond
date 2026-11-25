import { z } from "zod";

export interface ArticleMeta {
  title?: string;
  subtitle?: string;
  author?: string;
  authorPhoto?: string;
  publication?: string;
  published?: string;
  url?: string;
  cover?: string;
  preview: boolean;
}

export interface Article {
  meta: ArticleMeta;
  html: string;
  words: number;
}

/** Body ids share the app document, so footnote targets are namespaced. */
const ARTICLE_ID_PREFIX = "article-";

const FOOTNOTE_ATTRIBUTE = "data-footnote";

const SUBSTACK_CHROME = [
  ".subscription-widget-wrap",
  ".subscription-widget-wrap-editor",
  ".subscribe-widget",
  ".button-wrapper",
  ".captioned-button-wrap",
  ".post-ufi",
  ".share-dialog",
  ".like-button-container",
  ".image-link-expand",
  ".paywall",
  ".paywall-jump",
  ".native-video-embed",
  ".poll-embed",
  "[data-component-name='ButtonCreateButton']",
  "[data-component-name='SubscribeWidgetToDOM']",
];

const DROPPED = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "frame",
  "object",
  "embed",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "svg",
  "math",
  "video",
  "audio",
  "canvas",
  "link",
  "meta",
  "base",
  ...SUBSTACK_CHROME,
].join(",");

const KEPT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "sub",
  "sup",
  "mark",
  "small",
  "code",
  "pre",
  "kbd",
  "blockquote",
  "q",
  "cite",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "img",
  "hr",
  "br",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "div",
  "span",
  "time",
  "abbr",
]);

const KEPT_ATTRIBUTES = new Map<string, ReadonlySet<string>>([
  ["a", new Set(["href", "title"])],
  ["img", new Set(["src", "alt", "width", "height"])],
  ["td", new Set(["colspan", "rowspan"])],
  ["th", new Set(["colspan", "rowspan"])],
  ["ol", new Set(["start"])],
  ["abbr", new Set(["title"])],
]);

const EmbedSchema = z
  .object({
    url: z.string().optional().catch(undefined),
    title: z.string().optional().catch(undefined),
    text: z.string().optional().catch(undefined),
    name: z.string().optional().catch(undefined),
    username: z.string().optional().catch(undefined),
    videoId: z.string().optional().catch(undefined),
    gallery: z
      .object({ images: z.array(z.object({ src: z.string() })).catch([]) })
      .optional()
      .catch(undefined),
  })
  .catch({});

type Embed = z.infer<typeof EmbedSchema>;

export function readArticle(source: string): Article {
  const document = new DOMParser().parseFromString(source, "text/html");
  const meta = readMeta(document);
  const body = document.body;

  replaceEmbeds(body);
  collapsePictures(body);
  for (const element of body.querySelectorAll(DROPPED)) element.remove();
  for (const anchor of body.querySelectorAll("a.image-link")) {
    anchor.replaceWith(...anchor.childNodes);
  }
  for (const note of body.querySelectorAll(".footnote")) {
    note.setAttribute(FOOTNOTE_ATTRIBUTE, "");
  }

  for (const element of Array.from(body.querySelectorAll("*"))) {
    const tag = element.localName;
    if (!KEPT_TAGS.has(tag)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    keepAttributes(element, tag, meta.url);
    if (tag === "img" && !element.hasAttribute("src")) element.remove();
  }
  for (const paragraph of body.querySelectorAll("p")) {
    if (!paragraph.textContent?.trim() && !paragraph.querySelector("img")) {
      paragraph.remove();
    }
  }

  if (meta.cover && sameImage(meta.cover, firstImage(body))) {
    meta.cover = undefined;
  }

  return { meta, html: body.innerHTML, words: countWords(body) };
}

/** Counts per text node, since `textContent` runs adjacent paragraphs together. */
function countWords(body: HTMLElement): number {
  const walker = body.ownerDocument.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT,
  );
  let words = 0;
  while (walker.nextNode()) {
    words += (walker.currentNode.textContent ?? "")
      .split(/\s+/)
      .filter(Boolean).length;
  }
  return words;
}

function readMeta(document: Document): ArticleMeta {
  const read = (name: string) =>
    document
      .querySelector(`meta[name="pond:${name}"]`)
      ?.getAttribute("content")
      ?.trim() || undefined;
  return {
    title: read("title"),
    subtitle: read("subtitle"),
    author: read("author"),
    authorPhoto: httpsUrl(read("author-photo")),
    publication: read("publication"),
    published: read("published"),
    url: webUrl(read("url")),
    cover: httpsUrl(read("cover")),
    preview: read("preview") === "true",
  };
}

function keepAttributes(element: Element, tag: string, base?: string): void {
  const kept = KEPT_ATTRIBUTES.get(tag);
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name === FOOTNOTE_ATTRIBUTE && tag === "div") continue;
    if (name === "id") {
      element.setAttribute("id", `${ARTICLE_ID_PREFIX}${attribute.value}`);
      continue;
    }
    if (!kept?.has(name)) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === "href") {
      const href = linkTarget(attribute.value, base);
      if (href) element.setAttribute("href", href);
      else element.removeAttribute("href");
    }
    if (name === "src") {
      const src = httpsUrl(attribute.value);
      if (src) element.setAttribute("src", src);
      else element.removeAttribute("src");
    }
  }
}

function linkTarget(value: string, base?: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    return trimmed.length > 1
      ? `#${ARTICLE_ID_PREFIX}${trimmed.slice(1)}`
      : null;
  }
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return webUrl(trimmed, base) ?? null;
}

function webUrl(value: string | undefined, base?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function httpsUrl(value: string | undefined): string | undefined {
  const url = webUrl(value);
  return url?.startsWith("https:") ? url : undefined;
}

/** Keeps one https image per `picture`, preferring the `img` and falling back to the widest source. */
function collapsePictures(body: HTMLElement): void {
  for (const picture of body.querySelectorAll("picture")) {
    const img = picture.querySelector("img");
    const src =
      httpsUrl(img?.getAttribute("src") ?? undefined) ??
      widestSource(picture.querySelector("source")?.getAttribute("srcset"));
    if (!img || !src) {
      picture.remove();
      continue;
    }
    img.setAttribute("src", src);
    picture.replaceWith(img);
  }
  for (const img of body.querySelectorAll("img")) {
    if (httpsUrl(img.getAttribute("src") ?? undefined)) continue;
    const src = widestSource(img.getAttribute("srcset"));
    if (src) img.setAttribute("src", src);
  }
}

function widestSource(srcset: string | null | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; width: number } | undefined;
  for (const candidate of srcset.split(/,\s+/)) {
    const [url, descriptor = ""] = candidate.trim().split(/\s+/);
    const width = Number.parseInt(descriptor, 10) || 0;
    const safe = httpsUrl(url);
    if (safe && (!best || width > best.width)) best = { url: safe, width };
  }
  return best?.url;
}

/** Substack stores embeds as JSON in `data-attrs`; each becomes a plain link or figure. */
function replaceEmbeds(body: HTMLElement): void {
  const document = body.ownerDocument;
  for (const element of body.querySelectorAll(
    ".youtube-wrap, .twitter-embed, .embedded-post-wrap, .image-gallery-embed",
  )) {
    const embed = readEmbed(element);
    const replacement = element.classList.contains("image-gallery-embed")
      ? galleryFigure(document, embed)
      : element.classList.contains("twitter-embed")
        ? tweetQuote(document, embed)
        : embedLink(document, element, embed);
    if (replacement) element.replaceWith(replacement);
    else element.remove();
  }
}

function readEmbed(element: Element): Embed {
  try {
    return EmbedSchema.parse(
      JSON.parse(element.getAttribute("data-attrs") ?? ""),
    );
  } catch {
    return {};
  }
}

function galleryFigure(document: Document, embed: Embed): Element | null {
  const sources = (embed.gallery?.images ?? []).flatMap((image) => {
    const src = httpsUrl(image.src);
    return src ? [src] : [];
  });
  if (sources.length === 0) return null;
  const figure = document.createElement("figure");
  for (const src of sources) {
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", "");
    figure.append(img);
  }
  return figure;
}

function tweetQuote(document: Document, embed: Embed): Element | null {
  const url = webUrl(embed.url);
  if (!url) return null;
  const quote = document.createElement("blockquote");
  if (embed.text) {
    const text = document.createElement("p");
    text.textContent = embed.text;
    quote.append(text);
  }
  const cite = document.createElement("cite");
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.textContent = embed.username
    ? `${embed.name ?? embed.username} (@${embed.username})`
    : (embed.name ?? url);
  cite.append(link);
  quote.append(cite);
  return quote;
}

function embedLink(
  document: Document,
  element: Element,
  embed: Embed,
): Element | null {
  const youtube = element.classList.contains("youtube-wrap");
  const url = youtube
    ? embed.videoId &&
      `https://www.youtube.com/watch?v=${encodeURIComponent(embed.videoId)}`
    : webUrl(embed.url);
  if (!url) return null;
  const paragraph = document.createElement("p");
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.textContent = youtube ? "Watch on YouTube" : (embed.title ?? url);
  paragraph.append(link);
  return paragraph;
}

function firstImage(body: HTMLElement): string | undefined {
  return body.querySelector("img")?.getAttribute("src") ?? undefined;
}

function imageFileName(url: string): string {
  return decodeURIComponent(url).split("/").pop() ?? url;
}

/** Substack's CDN wraps the stored image URL, so compare the underlying file name. */
function sameImage(a: string, b: string | undefined): boolean {
  if (!b) {
    return false;
  }
  return imageFileName(a) === imageFileName(b);
}
