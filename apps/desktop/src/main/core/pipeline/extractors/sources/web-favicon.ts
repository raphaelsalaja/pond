import type metascraper from "metascraper";
import { getDomain } from "tldts";
import { browserUserAgent } from "../../../refresh/web-page-renderer";

const FAVICON_TIMEOUT_MS = 10_000;

/** 60 is `<`: the route answered with markup rather than the image its content type claimed. */
const MARKUP_START = 60;

const ICO_TYPES = ["image/vnd.microsoft.icon", "image/x-icon"];
const PNG_TYPES = ["image/png"];
const TYPES_BY_EXTENSION = new Map([
  ["ico", ICO_TYPES],
  ["png", PNG_TYPES],
]);

/** Icons a page lists for itself: `<link rel="icon">` and its Apple variants, and Windows tile images. */
const ICON_SOURCES = [
  { selector: 'link[rel*="icon" i]', attribute: "href" },
  {
    selector:
      'meta[name="msapplication-TileImage" i], meta[name^="msapplication-square" i]',
    attribute: "content",
  },
];

const SIZE_IN_URL = /\d+x\d+/;

export type FaviconRequest = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

interface IconCandidate {
  url: string;
  square: boolean;
  priority: number;
}

/**
 * Finds a page's favicon, probing candidates with `request` in this order: the
 * icons the page lists, biggest first; the site's `/favicon.ico` and
 * `/favicon.png`; Google's favicon service; then the same for the registrable
 * domain of a subdomain.
 */
export function faviconRules(request: FaviconRequest): metascraper.Rules {
  const resolve = (url: string, contentTypes?: ReadonlyArray<string>) =>
    resolveFavicon(url, contentTypes, request);

  const siteIcon = async (pageUrl: URL) =>
    (await resolve(new URL("/favicon.ico", pageUrl).href, ICO_TYPES)) ??
    (await resolve(new URL("/favicon.png", pageUrl).href, PNG_TYPES)) ??
    (await resolve(googleFaviconUrl(pageUrl)));

  return {
    logo: [
      async ({ htmlDom: $, url }) => {
        for (const candidate of pageIcons($, url)) {
          const resolved = await resolve(
            candidate.url,
            TYPES_BY_EXTENSION.get(extension(candidate.url)),
          );
          if (resolved) return resolved;
        }
        return undefined;
      },
      ({ url }) => siteIcon(new URL(url)),
      ({ url }) => {
        const root = registrableDomainUrl(new URL(url));
        return root ? siteIcon(root) : undefined;
      },
    ],
  };
}

/**
 * Resolves a favicon candidate to the URL that serves it. With `contentTypes`,
 * the response must also carry one of them and start with image bytes rather
 * than markup. Reads at most the first chunk, and resolves undefined instead of
 * rejecting, so an unreachable host or a timeout never outlives the caller.
 */
export async function resolveFavicon(
  url: string,
  contentTypes: ReadonlyArray<string> | undefined,
  request: FaviconRequest,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    const response = await request(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": browserUserAgent(), range: "bytes=0-0" },
    });
    const servesFavicon =
      response.ok && contentTypes
        ? servesType(response, contentTypes) &&
          (await startsWithImageBytes(response.body))
        : response.ok;
    await response.body?.cancel().catch(() => undefined);
    return servesFavicon ? response.url || url : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function servesType(
  response: Response,
  contentTypes: ReadonlyArray<string>,
): boolean {
  const type = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  return type !== undefined && contentTypes.includes(type);
}

/** An absent body is a server that announced an image and sent none of it. */
async function startsWithImageBytes(
  body: ReadableStream<Uint8Array> | null,
): Promise<boolean> {
  if (!body) return false;
  const reader = body.getReader();
  try {
    let chunk = await reader.read();
    while (!chunk.done && chunk.value.length === 0) {
      chunk = await reader.read();
    }
    return !chunk.done && chunk.value[0] !== MARKUP_START;
  } finally {
    reader.releaseLock();
  }
}

/** Square icons first, then by format and width, preferring PNG and touch icons. */
function pageIcons(
  $: metascraper.RulesTestOptions["htmlDom"],
  pageUrl: string,
): Array<IconCandidate> {
  const candidates = ICON_SOURCES.flatMap(({ selector, attribute }) =>
    $(selector)
      .toArray()
      .flatMap((node) => {
        const candidate = iconCandidate(
          $(node).attr(attribute),
          $(node).attr("sizes"),
          pageUrl,
        );
        return candidate ? [candidate] : [];
      }),
  );
  const byPriority = (a: IconCandidate, b: IconCandidate) =>
    b.priority - a.priority;
  return [
    ...candidates.filter((icon) => icon.square).toSorted(byPriority),
    ...candidates.filter((icon) => !icon.square).toSorted(byPriority),
  ];
}

function iconCandidate(
  href: string | undefined,
  sizes: string | undefined,
  pageUrl: string,
): IconCandidate | undefined {
  const url = httpUrl(href, pageUrl);
  if (!url) return undefined;
  const [height, width] = parseSize(sizes) ??
    parseSize(url.match(SIZE_IN_URL)?.[0]) ?? [0, 0];
  return {
    url,
    square: width === height,
    priority: formatWeight(url) * (width || 1),
  };
}

/** `sizes` reads height by width, like `32x32`; `any` has no size. */
function parseSize(size: string | undefined): [number, number] | undefined {
  const first = size?.trim().split(/\s+/)[0];
  if (!first) return undefined;
  const [height, width] = first.toLowerCase().replaceAll("×", "x").split("x");
  return [Number(height) || 0, Number(width) || 0];
}

function formatWeight(url: string): number {
  if (url.includes("apple") || url.includes("android")) return 5;
  if (url.endsWith("png")) return 5;
  if (url.endsWith("jpg") || url.endsWith("jpeg")) return 4;
  if (url.endsWith("svg")) return 3;
  if (url.endsWith("ico")) return 2;
  return 1;
}

function extension(url: string): string {
  const name = new URL(url).pathname.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function httpUrl(href: string | undefined, base: string): string | undefined {
  const trimmed = href?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Google's favicon service, the last resort once a site serves no icon itself. */
function googleFaviconUrl(pageUrl: URL): string {
  const url = new URL("https://www.google.com/s2/favicons");
  url.searchParams.set("domain_url", pageUrl.href);
  url.searchParams.set("sz", "128");
  return url.href;
}

/** A subdomain's page URL moved to its registrable domain, as `docs.example.com` to `example.com`. */
function registrableDomainUrl(pageUrl: URL): URL | undefined {
  const domain = getDomain(pageUrl.hostname);
  if (!domain || domain === pageUrl.hostname) return undefined;
  const root = new URL(pageUrl);
  root.hostname = domain;
  return root;
}
