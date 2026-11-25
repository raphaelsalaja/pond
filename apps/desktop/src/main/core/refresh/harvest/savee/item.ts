/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import type { BrowserValidators } from "../lib/browser-validation";
import { buildItemExpression } from "../lib/expression";

interface SaveeItemPage {
  title?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" | "video" }>;
  meta: { authorUrl?: string };
}

interface SaveeImageObject {
  "@type"?: string;
  name?: string;
  contentUrl?: string;
  creator?: { name?: string; url?: string };
}

export function buildExpression(shortId: string): string {
  return buildItemExpression(
    (validators) => validators,
    inPageSaveeHarvest,
    shortId,
  );
}

async function inPageSaveeHarvest(
  _shortId: string,
  norm: BrowserValidators,
): Promise<SaveeItemPage | null> {
  const isImageObject = (value: unknown): value is SaveeImageObject =>
    norm.object.safeParse(value).success;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (document.querySelector('meta[property="og:image"]')) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  let ld: SaveeImageObject | null = null;
  for (const node of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const parsed: unknown = JSON.parse(node.textContent ?? "");
      if (isImageObject(parsed) && parsed["@type"] === "ImageObject") {
        ld = parsed;
      }
    } catch {
      /** Malformed linked data falls back to the share tags. */
    }
  }
  const page: SaveeItemPage = { mediaUrls: [], meta: {} };
  const title =
    ld?.name?.trim() ||
    meta("og:title").replace(/\s+by\s+.+?\s+–\s+Savee$/, "");
  if (title) page.title = title;
  if (ld?.creator?.name) page.author = ld.creator.name;
  if (ld?.creator?.url) page.meta.authorUrl = ld.creator.url;
  const media = ld?.contentUrl || meta("og:image");
  if (media) {
    page.mediaUrls.push({
      url: media,
      type: /\.mp4(?:\?|$)/i.test(media) ? "video" : "image",
    });
  }
  return page.title || media ? page : null;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
