import { isHTMLTag } from "@pond/ui/dom";

/** Pond accepts at most 500 items in one capture. */
export const MAX_IMAGES = 500;
/** Computed styles are costly, so background images come from the first few thousand elements. */
const MAX_STYLED_ELEMENTS = 4000;
/** Tracking pixels and spacers are never worth saving. */
const MIN_EDGE = 16;
const LARGE_EDGE = 1200;
const MEDIUM_EDGE = 400;

export type SizeBucket = "large" | "medium" | "small";

export const SIZE_BUCKETS: ReadonlyArray<{ id: SizeBucket; label: string }> = [
  { id: "large", label: "Large" },
  { id: "medium", label: "Medium" },
  { id: "small", label: "Small" },
];

export interface Candidate {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface PageImage extends Candidate {
  name: string;
  format: string;
  domain: string;
}

const EXTENSION_FORMATS = new Map([
  ["jpg", "JPG"],
  ["jpeg", "JPG"],
  ["png", "PNG"],
  ["gif", "GIF"],
  ["webp", "WEBP"],
  ["avif", "AVIF"],
  ["svg", "SVG"],
  ["bmp", "BMP"],
  ["ico", "ICO"],
  ["heic", "HEIC"],
]);

const IMAGE_LINK = /\.(jpe?g|png|gif|webp|avif|svg|bmp|heic)(?:$|[?#])/i;

function parse(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

export function imageFormat(url: string): string {
  const parsed = parse(url);
  if (!parsed) {
    return "Other";
  }
  const extension = parsed.pathname.split(".").at(-1)?.toLowerCase() ?? "";
  const query =
    parsed.searchParams.get("format") ?? parsed.searchParams.get("fm") ?? "";
  return (
    EXTENSION_FORMATS.get(extension) ??
    EXTENSION_FORMATS.get(query.toLowerCase()) ??
    "Other"
  );
}

export function imageName(url: string): string {
  const parsed = parse(url);
  if (!parsed) {
    return url;
  }
  const last = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /** A malformed escape keeps the raw path segment as the name. */
  }
  return decoded.replace(/\.[a-z\d]{2,5}$/i, "") || parsed.hostname;
}

export function sizeBucket(width: number, height: number): SizeBucket {
  const edge = Math.max(width, height);
  if (edge >= LARGE_EDGE) {
    return "large";
  }
  return edge >= MEDIUM_EDGE ? "medium" : "small";
}

/** Picks the widest `srcset` entry so a save gets the full image, not the thumbnail on screen. */
export function largestSrcset(srcset: string, base: string): string | null {
  let best: { url: string; size: number } | null = null;
  for (const entry of srcset.split(/,\s+/)) {
    const [raw, descriptor = "1x"] = entry.trim().split(/\s+/);
    if (!raw) {
      continue;
    }
    const size = Number.parseFloat(descriptor) || 1;
    const url = parse(raw, base)?.href;
    if (url && (!best || size > best.size)) {
      best = { url, size };
    }
  }
  return best?.url ?? null;
}

function isWeb(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function backgroundUrls(value: string, base: string): Array<string> {
  return [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].flatMap(
    ([, , raw]) => {
      if (!raw) {
        return [];
      }
      const url = parse(raw, base)?.href;
      return url && isWeb(url) ? [url] : [];
    },
  );
}

export function collectCandidates(root: Document): Array<Candidate> {
  const found = new Map<string, Candidate>();
  const base = root.baseURI;
  const add = (
    url: string | null | undefined,
    alt = "",
    width = 0,
    height = 0,
  ) => {
    if (!url || !isWeb(url)) {
      return;
    }
    const existing = found.get(url);
    if (existing) {
      existing.width ||= width;
      existing.height ||= height;
      existing.alt ||= alt;
      return;
    }
    found.set(url, { url, alt, width, height });
  };

  for (const image of Array.from(root.images)) {
    const shown = image.currentSrc || image.src;
    const largest = image.srcset ? largestSrcset(image.srcset, base) : null;
    /** `naturalWidth` divides by the chosen density, so responsive images get probed instead. */
    const responsive =
      !!image.srcset || isHTMLTag(image.parentElement, "picture");
    if (largest && largest !== shown) {
      add(largest, image.alt);
    } else if (responsive) {
      add(shown, image.alt);
    } else {
      add(shown, image.alt, image.naturalWidth, image.naturalHeight);
    }
  }
  for (const video of Array.from(root.querySelectorAll("video[poster]"))) {
    if (isHTMLTag(video, "video")) {
      add(video.poster);
    }
  }
  for (const link of Array.from(root.querySelectorAll("a[href]"))) {
    if (isHTMLTag(link, "a") && IMAGE_LINK.test(link.pathname)) {
      add(link.href, link.textContent?.trim() ?? "");
    }
  }
  const share = root.querySelector<HTMLMetaElement>(
    'meta[property="og:image"]',
  );
  if (share?.content) {
    add(parse(share.content, base)?.href);
  }
  const styled = root.body?.querySelectorAll("*") ?? [];
  for (
    let index = 0;
    index < Math.min(styled.length, MAX_STYLED_ELEMENTS);
    index++
  ) {
    const element = styled[index];
    if (!element) {
      continue;
    }
    const background = getComputedStyle(element).backgroundImage;
    if (background && background !== "none") {
      for (const url of backgroundUrls(background, base)) {
        add(url);
      }
    }
  }
  return [...found.values()];
}

export function describe(candidate: Candidate): PageImage {
  return {
    ...candidate,
    name: imageName(candidate.url),
    format: imageFormat(candidate.url),
    domain: parse(candidate.url)?.hostname.replace(/^www\./, "") ?? "",
  };
}

export interface ImageFilters {
  query: string;
  sizes: ReadonlySet<SizeBucket>;
  hiddenFormats: ReadonlySet<string>;
  hiddenDomains: ReadonlySet<string>;
  minWidth: number;
  minHeight: number;
}

/** Images still probing for their size stay visible so the grid doesn't jump while they load. */
export function matchesFilters(
  image: PageImage,
  filters: ImageFilters,
): boolean {
  const known = image.width > 0 && image.height > 0;
  if (known && (image.width < MIN_EDGE || image.height < MIN_EDGE)) {
    return false;
  }
  if (known && !filters.sizes.has(sizeBucket(image.width, image.height))) {
    return false;
  }
  if (
    known &&
    (image.width < filters.minWidth || image.height < filters.minHeight)
  ) {
    return false;
  }
  if (filters.hiddenFormats.has(image.format)) {
    return false;
  }
  if (filters.hiddenDomains.has(image.domain)) {
    return false;
  }
  const needle = filters.query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [image.name, image.alt, image.url].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

export interface FacetCount {
  id: string;
  total: number;
  selected: number;
}

export function facetCounts(
  images: ReadonlyArray<PageImage>,
  selected: ReadonlySet<string>,
  facet: (image: PageImage) => string | null,
): Array<FacetCount> {
  const counts = new Map<string, FacetCount>();
  for (const image of images) {
    const id = facet(image);
    if (!id) {
      continue;
    }
    const count = counts.get(id) ?? { id, total: 0, selected: 0 };
    count.total++;
    if (selected.has(image.url)) {
      count.selected++;
    }
    counts.set(id, count);
  }
  return [...counts.values()].toSorted((a, b) => b.total - a.total);
}
