/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageTiktokNormalize } from "./normalize";
import type { TiktokVideoPage } from "./normalize";

export function buildExpression(videoId: string): string {
  return buildItemExpression(
    inPageTiktokNormalize,
    inPageTiktokHarvest,
    videoId,
  );
}

async function inPageTiktokHarvest(
  _videoId: string,
  norm: ReturnType<typeof inPageTiktokNormalize>,
): Promise<TiktokVideoPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector("video") ||
      document.querySelector('[data-e2e="browse-video-desc"]')
    ) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  return norm.extractVideoPageMeta();
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
