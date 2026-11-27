import { expect, it } from "vitest";
import { WebPageExtractor } from "./web";
import type { FaviconRequest } from "./web-favicon";

const fetchedHtml = "<html><head><title>Fetched page</title></head></html>";
const renderedHtml = "<html><head><title>Rendered page</title></head></html>";

function renderRecorder() {
  const renders: Array<[string, AbortSignal | undefined]> = [];
  return {
    renders,
    renderHtml: async (url: string, signal?: AbortSignal) => {
      renders.push([url, signal]);
      return renderedHtml;
    },
  };
}

type ServedFile = { type: string; body: Uint8Array<ArrayBuffer> | string };

const ICO_BYTES = new Uint8Array([0, 0, 1, 0]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** An offline web where only the listed URLs exist; every other URL answers with a 404 page. */
function servedFiles(files: Record<string, ServedFile> = {}): FaviconRequest {
  return async (url, init) => {
    init.signal?.throwIfAborted();
    const file = files[url];
    return file
      ? new Response(file.body, { headers: { "content-type": file.type } })
      : new Response("<html>Not found</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
  };
}

it("uses a browser render when the direct fetch reaches a bot wall", async () => {
  const { renders, renderHtml } = renderRecorder();
  const extractor = new WebPageExtractor({
    fetchHtml: async () => null,
    renderHtml,
    fetchFavicon: servedFiles(),
  });

  await expect(
    extractor.extract({ url: new URL("https://example.com/article") }),
  ).resolves.toMatchObject({ title: "Rendered page" });
  expect(renders).toEqual([["https://example.com/article", undefined]]);
});

const amazonCover = (attrs: string) =>
  `<html><head><title>Thinking in Systems</title></head><body><img alt="Thinking in Systems" id="landingImage" ${attrs}></body></html>`;

function extractFrom(
  url: string,
  html: string,
  files: Record<string, ServedFile> = {},
) {
  const extractor = new WebPageExtractor({
    fetchHtml: async () => ({ html }),
    renderHtml: renderRecorder().renderHtml,
    fetchFavicon: servedFiles(files),
  });
  return extractor.extract({ url: new URL(url) });
}

it("saves the high-resolution cover from an Amazon product page", async () => {
  const capture = await extractFrom(
    "https://www.amazon.com/Thinking-Systems-Donella-H-Meadows/dp/1603580557",
    amazonCover(
      'src="https://m.media-amazon.com/images/I/41PzYXIWz9L._SY445_SX342_ML2_.jpg" data-old-hires="https://m.media-amazon.com/images/I/71+QmpkC0aL._SL1500_.jpg"',
    ),
  );

  expect(capture.media).toEqual([
    {
      url: "https://m.media-amazon.com/images/I/71+QmpkC0aL._SL1500_.jpg",
      type: "image",
    },
  ]);
  expect(capture.extras?.product).toBe(true);
});

it("falls back to the displayed Amazon image when no high-resolution one is listed", async () => {
  const capture = await extractFrom(
    "https://www.amazon.co.uk/dp/1603580557",
    amazonCover(
      'src="https://m.media-amazon.com/images/I/41PzYXIWz9L._SY445_.jpg" data-old-hires=""',
    ),
  );

  expect(capture.media).toEqual([
    {
      url: "https://m.media-amazon.com/images/I/41PzYXIWz9L._SY445_.jpg",
      type: "image",
    },
  ]);
});

it("keeps the page's og:image on sites other than Amazon", async () => {
  const capture = await extractFrom(
    "https://example.com/article",
    `<html><head><meta property="og:image" content="https://example.com/share.jpg"></head><body><img id="landingImage" src="https://example.com/hero.jpg"></body></html>`,
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/share.jpg", type: "image" },
  ]);
  expect(capture.extras?.product).toBeUndefined();
});

const shopPage = (jsonLd: string) =>
  `<html><head><meta property="og:image" content="https://example.com/banner.jpg"><script type="application/ld+json">${jsonLd}</script></head></html>`;

it("prefers a shop's JSON-LD product image over its og:image banner", async () => {
  const capture = await extractFrom(
    "https://example.com/records/kind-of-blue",
    shopPage(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Kind of Blue",
        image: ["/covers/kind-of-blue.jpg", "/covers/back.jpg"],
      }),
    ),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/covers/kind-of-blue.jpg", type: "image" },
  ]);
  expect(capture.extras?.product).toBe(true);
});

it("marks a JSON-LD product page as a product even without a product image", async () => {
  const capture = await extractFrom(
    "https://example.com/magazines/issue-12",
    shopPage(JSON.stringify({ "@type": "PublicationIssue", name: "Issue 12" })),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/banner.jpg", type: "image" },
  ]);
  expect(capture.extras?.product).toBe(true);
});

it("marks a page with og:type product as a product", async () => {
  const capture = await extractFrom(
    "https://example.com/products/monograph",
    `<html><head><meta property="og:type" content="product"><meta property="og:image" content="https://example.com/cover.png"></head></html>`,
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/cover.png", type: "image" },
  ]);
  expect(capture.extras?.product).toBe(true);
});

it("marks a page with a schema.org Product microdata item as a product", async () => {
  const capture = await extractFrom(
    "https://example.com/products/cookbook",
    `<html><head><meta property="og:image" content="https://example.com/cover.jpg"></head><body><div itemscope itemtype="http://schema.org/Product"><div itemprop="offers" itemscope itemtype="http://schema.org/Offer"></div></div></body></html>`,
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/cover.jpg", type: "image" },
  ]);
  expect(capture.extras?.product).toBe(true);
});

it("ignores Product microdata nested as a property of another item", async () => {
  const capture = await extractFrom(
    "https://example.com/reviews/cookbook",
    `<html><head><meta property="og:type" content="article"></head><body><article itemscope itemtype="https://schema.org/Review"><div itemprop="itemReviewed" itemscope itemtype="https://schema.org/Product"></div></article></body></html>`,
  );

  expect(capture.extras?.product).toBeUndefined();
});

it("finds a book cover inside a JSON-LD @graph with an ImageObject", async () => {
  const capture = await extractFrom(
    "https://example.com/thinking-in-systems",
    shopPage(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", image: "https://example.com/og.jpg" },
          {
            "@type": ["Book", "Product"],
            image: {
              "@type": "ImageObject",
              url: "https://example.com/cover.jpg",
            },
          },
        ],
      }),
    ),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/cover.jpg", type: "image" },
  ]);
});

it("skips unusable JSON-LD product images and keeps looking", async () => {
  const capture = await extractFrom(
    "https://example.com/records/selected-ambient-works",
    shopPage(
      JSON.stringify({
        "@type": "Product",
        image: ["https://[", "javascript:alert(1)", "/covers/saw.jpg"],
      }),
    ),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/covers/saw.jpg", type: "image" },
  ]);
});

it("keeps the og:image when every JSON-LD product image is unusable", async () => {
  const capture = await extractFrom(
    "https://example.com/records/broken",
    shopPage(JSON.stringify({ "@type": "Product", image: "https://[" })),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/banner.jpg", type: "image" },
  ]);
});

it("keeps the og:image when the JSON-LD describes an article", async () => {
  const capture = await extractFrom(
    "https://example.com/story",
    shopPage(
      JSON.stringify({
        "@type": "NewsArticle",
        image: "https://example.com/inline.jpg",
      }),
    ),
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/banner.jpg", type: "image" },
  ]);
  expect(capture.extras?.product).toBeUndefined();
});

it("does not acquire a browser when the direct fetch succeeds", async () => {
  const { renders, renderHtml } = renderRecorder();
  const extractor = new WebPageExtractor({
    fetchHtml: async () => ({ html: fetchedHtml }),
    renderHtml,
    fetchFavicon: servedFiles(),
  });

  await expect(
    extractor.extract({ url: new URL("https://example.com/article") }),
  ).resolves.toMatchObject({ title: "Fetched page" });
  expect(renders).toEqual([]);
});

it("titles a search results page with its query instead of the engine's favicon", async () => {
  const capture = await extractFrom(
    "https://www.google.com/search?q=malaga",
    `<html><head><title>Google Search</title><meta name="description" content="Search the world's information"><link rel="icon" href="/favicon.ico"></head></html>`,
    {
      "https://www.google.com/favicon.ico": {
        type: "image/x-icon",
        body: ICO_BYTES,
      },
    },
  );

  expect(capture).toMatchObject({
    title: "malaga",
    media: [],
    extras: {
      publisher: "Google Search",
      faviconUrl: "https://www.google.com/favicon.ico",
      search: { engine: "Google Search", query: "malaga" },
    },
  });
  expect(capture.description).toBeUndefined();
});

it("captures a converted text document as the save's article", async () => {
  const extractor = new WebPageExtractor({
    fetchHtml: async () => ({
      html: "<html><head><title>Design Principles</title></head><body><h1>Design Principles</h1><p>Body.</p></body></html>",
      document: {
        format: "markdown",
        title: "Design Principles",
        bodyHtml: "<h1>Design Principles</h1><p>Body.</p>",
        source: {
          text: "# Design Principles\n\nBody.",
          filename: "design.md",
          mimeType: "text/markdown",
        },
      },
    }),
    renderHtml: renderRecorder().renderHtml,
    fetchFavicon: servedFiles(),
  });

  const capture = await extractor.extract({
    url: new URL("https://vercel.com/design.md"),
  });
  expect(capture.title).toBe("Design Principles");
  expect(capture.article).toEqual({
    html: "<h1>Design Principles</h1><p>Body.</p>",
    canonicalUrl: "https://vercel.com/design.md",
    source: {
      text: "# Design Principles\n\nBody.",
      filename: "design.md",
      mimeType: "text/markdown",
    },
  });
  expect(capture.extras?.textDocument).toBe(true);
});

it("covers a page without a share image with the site's root favicon", async () => {
  const capture = await extractFrom(
    "https://example.com/notes",
    "<html><head><title>Notes</title></head></html>",
    {
      "https://example.com/favicon.png": { type: "image/png", body: PNG_BYTES },
    },
  );

  expect(capture.media).toEqual([
    { url: "https://example.com/favicon.png", type: "image" },
  ]);
  expect(capture.extras?.faviconUrl).toBe("https://example.com/favicon.png");
});

it("falls back to Google's favicon service when the site's favicon route serves a page", async () => {
  const google =
    "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fnotes&sz=128";
  const capture = await extractFrom(
    "https://example.com/notes",
    "<html><head><title>Notes</title></head></html>",
    {
      "https://example.com/favicon.ico": {
        type: "image/x-icon",
        body: "<html>Home</html>",
      },
      [google]: { type: "image/png", body: PNG_BYTES },
    },
  );

  expect(capture.extras?.faviconUrl).toBe(google);
});

it("prefers the largest touch icon a page lists over its small favicon", async () => {
  const capture = await extractFrom(
    "https://example.com/notes",
    `<html><head><link rel="icon" href="/favicon.ico" sizes="16x16"><link rel="apple-touch-icon" href="/touch.png" sizes="180x180"></head></html>`,
    {
      "https://example.com/favicon.ico": {
        type: "image/x-icon",
        body: ICO_BYTES,
      },
      "https://example.com/touch.png": { type: "image/png", body: PNG_BYTES },
    },
  );

  expect(capture.extras?.faviconUrl).toBe("https://example.com/touch.png");
});

it("uses the registrable domain's favicon for a subdomain that serves none", async () => {
  const capture = await extractFrom(
    "https://docs.example.co.uk/guide",
    "<html><head><title>Guide</title></head></html>",
    {
      "https://example.co.uk/favicon.ico": {
        type: "image/x-icon",
        body: ICO_BYTES,
      },
    },
  );

  expect(capture.extras?.faviconUrl).toBe("https://example.co.uk/favicon.ico");
});
