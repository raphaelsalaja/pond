/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageYoutubeNormalize, type YoutubeWatchPage } from "./normalize";

/** The scraper only reads the watch UI; saved forms recognized by sourceIdFromUrl can render a different page, so navigate to the canonical watch URL. */
export function urlForHarvest(url: string): string {
  const videoId = sourceIdFromUrl("youtube", url);
  if (!videoId) return url;
  const out = new URL("https://www.youtube.com/watch");
  out.searchParams.set("v", videoId);
  return out.href;
}

export function buildExpression(videoId: string): string {
  return buildItemExpression(
    inPageYoutubeNormalize,
    inPageYoutubeHarvest,
    videoId,
  );
}

async function inPageYoutubeHarvest(
  _videoId: string,
  norm: ReturnType<typeof inPageYoutubeNormalize>,
): Promise<YoutubeWatchPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (document.querySelector("#title h1, ytd-video-primary-info-renderer"))
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return norm.extractWatchPageMeta();
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
