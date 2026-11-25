/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface BlueskyPostPage {
  description?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: { publishedAt?: string };
}

export function buildExpression(postId: string): string {
  return buildItemExpression(() => ({}), inPageBlueskyHarvest, postId);
}

/** The API capture runs first; this reads the server-rendered share tags when the API is down. */
async function inPageBlueskyHarvest(): Promise<BlueskyPostPage | null> {
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const description = meta("og:description");
  const image = meta("og:image");
  if (!description && !image) return null;
  const page: BlueskyPostPage = { mediaUrls: [], meta: {} };
  if (description) page.description = description;
  if (image) page.mediaUrls.push({ url: image, type: "image" });
  const published = meta("article:published_time");
  if (published) page.meta.publishedAt = published;
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
