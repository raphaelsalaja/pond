/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageRedditNormalize } from "./normalize";
import type { RedditPostPage } from "./normalize";

export function buildExpression(postId: string): string {
  return buildItemExpression(
    inPageRedditNormalize,
    inPageRedditHarvest,
    postId,
  );
}

async function inPageRedditHarvest(
  _postId: string,
  norm: ReturnType<typeof inPageRedditNormalize>,
): Promise<RedditPostPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector("shreddit-post, h1") ||
      document.querySelector('meta[property="og:title"]')
    ) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  const playerDeadline = Date.now() + 4000;
  while (norm.videoPending() && Date.now() < playerDeadline) {
    await new Promise((r) => {
      setTimeout(r, 200);
    });
  }
  return norm.extractPostMeta();
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
