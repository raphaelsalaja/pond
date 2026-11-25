/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageLinkedInNormalize } from "./normalize";
import type { LinkedInPostPage } from "./normalize";

export function buildExpression(postId: string): string {
  return buildItemExpression(
    inPageLinkedInNormalize,
    inPageLinkedInHarvest,
    postId,
  );
}

/** The post renders after load, so the harvest waits for the update before reading it and falls back to the share tags. */
async function inPageLinkedInHarvest(
  postId: string,
  norm: ReturnType<typeof inPageLinkedInNormalize>,
): Promise<LinkedInPostPage | null> {
  const BLOCKED = /^\/(?:checkpoint|challenge|authwall|login|uas\/login)/;
  const ANY_UPDATE =
    ".feed-shared-update-v2, [data-urn^='urn:li:activity:'], [data-urn^='urn:li:ugcPost:']";
  const byId = `[data-urn$=":${postId}"], [data-id$=":${postId}"]`;
  if (BLOCKED.test(location.pathname)) return null;

  for (let attempt = 0; attempt < 48; attempt++) {
    if (document.querySelector(ANY_UPDATE)) {
      break;
    }
    if (BLOCKED.test(location.pathname)) {
      return null;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  const root =
    document.querySelector(byId) ?? document.querySelector(ANY_UPDATE);
  if (root) {
    const page = norm.postPage(root, postId);
    const empty = !page.description && page.mediaUrls.length === 0;
    return empty && !page.title ? null : page;
  }

  /** Share tags only stand in when no update rendered: their image can't be told apart from post media. */
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const page: LinkedInPostPage = { mediaUrls: [], meta: {} };
  const description = norm.clean(meta("og:description"));
  if (description) page.description = description;
  const title = norm.titleFrom(norm.clean(meta("og:title")));
  if (title) page.title = title;
  const image = meta("og:image");
  if (image.startsWith("http")) {
    page.mediaUrls.push({ url: image, type: "image" });
  }
  if (!title && !description) return null;
  const publishedAt = norm.publishedAtFromId(postId);
  if (publishedAt) page.meta.publishedAt = publishedAt;
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
