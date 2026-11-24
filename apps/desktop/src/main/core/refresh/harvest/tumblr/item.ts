/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface TumblrPostPage {
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: Record<string, string>;
}

export function buildExpression(postId: string): string {
  return buildItemExpression(() => ({}), inPageTumblrHarvest, postId);
}

async function inPageTumblrHarvest(): Promise<TumblrPostPage | null> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        'meta[property="og:image"], meta[name="description"]',
      )
    ) {
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
  const page: TumblrPostPage = { mediaUrls: [], meta: {} };
  const description = meta("description");
  if (description) {
    page.description = description;
  }
  const blog = /tumblr\.com\/([a-z0-9-]+)\//i.exec(location.href)?.[1];
  if (blog) {
    page.author = blog;
  }
  const image = meta("og:image");
  if (image) {
    page.mediaUrls.push({ url: image, type: "image" });
  }
  return page.description || image ? page : null;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
