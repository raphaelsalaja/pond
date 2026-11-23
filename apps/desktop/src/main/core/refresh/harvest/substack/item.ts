/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface SubstackPostPage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: { authorAvatar?: string; publishedAt?: string; publisher?: string };
}

export function buildExpression(postId: string): string {
  return buildItemExpression(() => ({}), inPageSubstackHarvest, postId);
}

async function inPageSubstackHarvest(): Promise<SubstackPostPage | null> {
  const deadline = Date.now() + 10_000;
  const body = (): HTMLElement | null =>
    document.querySelector(".available-content, .body.markup");
  while (Date.now() < deadline) {
    if (body() || document.querySelector('meta[property="og:title"]')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const meta = (name: string): string =>
    document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const subtitle = document.querySelector("h3.subtitle")?.textContent?.trim();
  // biome-ignore lint/performance/useDomNodeTextContent: the saved text needs rendered line breaks between paragraphs.
  const text = [subtitle, body()?.innerText?.trim()]
    .filter(Boolean)
    .join("\n\n");
  const page: SubstackPostPage = { mediaUrls: [], meta: {} };
  const title =
    document.querySelector("h1.post-title")?.textContent?.trim() ||
    meta("og:title");
  if (title) page.title = title;
  if (text) {
    page.description =
      text.length > 20_000 ? `${text.slice(0, 20_000)}…` : text;
  } else if (meta("og:description")) {
    page.description = meta("og:description");
  }
  const author = meta("author");
  if (author) page.author = author;
  const image = meta("og:image");
  if (image) page.mediaUrls.push({ url: image, type: "image" });
  const published = document
    .querySelector('meta[property="article:published_time"]')
    ?.getAttribute("content");
  if (published) page.meta.publishedAt = published;
  const publisher = meta("og:site_name");
  if (publisher) page.meta.publisher = publisher;
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
