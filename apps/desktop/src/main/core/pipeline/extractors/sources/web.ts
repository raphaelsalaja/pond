import type { CaptureMedia } from "@pond/schema/raw";
import metascraper from "metascraper";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogoFavicon from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";
import { z } from "zod";
import { renderPageHtml } from "../../../refresh/web-page-renderer";
import { TerminalError, TransientError } from "../errors";
import type { Capture, ExtractInput, Extractor } from "../types";
import { fetchHtml } from "./web-fetch";

type WebExtras = {
  publisher?: string;
  faviconUrl?: string;
  product?: boolean;
};

const PRODUCT_FLAG = "true";

const AMAZON_HOST = /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/;
const AMAZON_COVER_SELECTOR = "#landingImage, #imgBlkFront, #ebooksImgBlkFront";

/** Amazon product pages carry no og:image; the item photo or cover lives in the image block. */
const amazonProductImage: metascraper.Rules = {
  test: ({ url }) => AMAZON_HOST.test(new URL(url).hostname),
  image: ({ htmlDom: $, url }) => {
    const img = $(AMAZON_COVER_SELECTOR).first();
    return (
      resolveHttpUrl(img.attr("data-old-hires"), url) ??
      resolveHttpUrl(img.attr("src"), url)
    );
  },
  product: ({ htmlDom: $ }) =>
    $(AMAZON_COVER_SELECTOR).length > 0 ? PRODUCT_FLAG : undefined,
};

/** A throwing rule makes metascraper skip every later image rule, so bad candidates resolve to undefined. */
function resolveHttpUrl(
  src: string | undefined,
  base: string,
): string | undefined {
  const picked = pickString(src);
  if (!picked) return undefined;
  try {
    const resolved = new URL(picked, base);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.href
      : undefined;
  } catch {
    return undefined;
  }
}

const PRODUCT_TYPES = new Set([
  "Product",
  "ProductGroup",
  "IndividualProduct",
  "Book",
  "MusicAlbum",
  "MusicRelease",
  "Periodical",
  "PublicationIssue",
]);

const JsonLdImageRef = z.union([
  z.string(),
  z
    .object({ url: z.string().optional(), contentUrl: z.string().optional() })
    .transform((image) => image.url ?? image.contentUrl),
]);
const JsonLdProduct = z.object({
  "@type": z.union([z.string(), z.array(z.string())]),
  image: z.union([JsonLdImageRef, z.array(JsonLdImageRef)]).optional(),
});
const JsonLdGraph = z.object({ "@graph": z.array(z.json()) });
const JSON_LD_SELECTOR = 'script[type="application/ld+json"]';

/** Shops often point og:image at a banner; their JSON-LD product entry names the item photo or cover. */
const jsonLdProductImage: metascraper.Rules = {
  image: ({ htmlDom: $, url }) => {
    for (const script of $(JSON_LD_SELECTOR).toArray()) {
      for (const product of productsFromJsonLd($(script).text())) {
        for (const src of [product.image].flat()) {
          const resolved = resolveHttpUrl(src, url);
          if (resolved) return resolved;
        }
      }
    }
    return undefined;
  },
  product: ({ htmlDom: $ }) =>
    $(JSON_LD_SELECTOR)
      .toArray()
      .some((script) => productsFromJsonLd($(script).text()).length > 0)
      ? PRODUCT_FLAG
      : undefined,
};

const OG_PRODUCT_TYPES = new Set(["product", "product.item", "product.group"]);
/** Top-level microdata items; an item with itemprop is a property of another item, like an Offer. */
const MICRODATA_ITEM_SELECTOR = "[itemscope][itemtype]:not([itemprop])";

/** Shops without JSON-LD still mark product pages with og:type or schema.org microdata. */
const pageMarkupProduct: metascraper.Rules = {
  product: ({ htmlDom: $ }) => {
    const ogType = $('meta[property="og:type"]').attr("content");
    if (OG_PRODUCT_TYPES.has(ogType?.trim().toLowerCase() ?? "")) {
      return PRODUCT_FLAG;
    }
    const isProductItem = $(MICRODATA_ITEM_SELECTOR)
      .toArray()
      .some((item) =>
        ($(item).attr("itemtype") ?? "")
          .split(/\s+/)
          .some((type) => PRODUCT_TYPES.has(type.split("/").pop() ?? "")),
      );
    return isProductItem ? PRODUCT_FLAG : undefined;
  },
};

function productsFromJsonLd(text: string): z.infer<typeof JsonLdProduct>[] {
  const parsed = z.json().safeParse(safeJsonParse(text));
  if (!parsed.success) return [];
  const roots = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const nodes = roots.flatMap((root) => {
    const graph = JsonLdGraph.safeParse(root);
    return graph.success ? [root, ...graph.data["@graph"]] : [root];
  });
  return nodes.flatMap((node) => {
    const product = JsonLdProduct.safeParse(node);
    if (!product.success) return [];
    const types = [product.data["@type"]].flat();
    return types.some((type) => PRODUCT_TYPES.has(type)) ? [product.data] : [];
  });
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const scrape = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  amazonProductImage,
  jsonLdProductImage,
  pageMarkupProduct,
  metascraperImage(),
  metascraperLogoFavicon(),
  metascraperAuthor(),
  metascraperDate(),
  metascraperPublisher(),
  metascraperUrl(),
]);

interface WebPageExtractorDependencies {
  fetchHtml: (url: string) => Promise<string | null>;
  renderHtml: (url: string, signal?: AbortSignal) => Promise<string>;
}

const defaultDependencies: WebPageExtractorDependencies = {
  fetchHtml,
  renderHtml,
};

export class WebPageExtractor implements Extractor {
  readonly id = "web-page";
  readonly source = "web" as const;
  readonly validUrl: readonly RegExp[] = [];
  readonly cookieDomain = null;

  constructor(
    private readonly dependencies: WebPageExtractorDependencies = defaultDependencies,
  ) {}

  authCookies(): boolean {
    return false;
  }

  suitable(url: URL): boolean {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  async extract(input: ExtractInput): Promise<Capture> {
    const html =
      (await this.dependencies.fetchHtml(input.url.href)) ??
      (await this.dependencies.renderHtml(input.url.href, input.signal));
    const meta = await scrape({ url: input.url.href, html });

    const canonical = pickString(meta.url) ?? input.url.href;

    const faviconUrl = pickString(meta.logo);
    const coverUrl = pickString(meta.image) ?? faviconUrl;
    const media: CaptureMedia[] = coverUrl
      ? [{ url: coverUrl, type: "image" }]
      : [];

    const authorName = pickString(meta.author);
    const author = authorName ? { name: authorName } : undefined;

    const publishedAt = pickString(meta.date);
    const publisher = pickString(meta.publisher);

    const extras: WebExtras = {};
    if (publisher) extras.publisher = publisher;
    if (faviconUrl) extras.faviconUrl = faviconUrl;
    if (meta.product === PRODUCT_FLAG) extras.product = true;

    const title = pickString(meta.title);
    const description = pickString(meta.description);
    const capture: Capture = {
      id: canonical,
      source: "web",
      url: canonical,
      media,
    };
    if (title) capture.title = title;
    if (description) capture.description = description;
    if (author) capture.author = author;
    if (publishedAt) capture.publishedAt = publishedAt;
    if (Object.keys(extras).length > 0) capture.extras = extras;
    return capture;
  }
}

async function renderHtml(url: string, signal?: AbortSignal): Promise<string> {
  const rendered = await renderPageHtml(url, signal);
  if (!rendered.ok) {
    if (rendered.reason === "navigation")
      throw new TransientError("web render: navigation failed");
    if (rendered.reason === "read-timeout")
      throw new TransientError("web render: read timed out");
    throw new TerminalError("web render returned empty document");
  }
  assertPageStatus(rendered.status, "web render");
  return rendered.html;
}

function assertPageStatus(status: number, label: string): void {
  if (status < 400) return;
  if (status >= 500 || status === 429) {
    throw new TransientError(`${label} ${status}`);
  }
  throw new TerminalError(`${label} ${status}`);
}

function pickString(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
