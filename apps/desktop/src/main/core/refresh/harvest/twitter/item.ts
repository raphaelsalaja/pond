import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import {
  captureFromTweetDraft,
  draftFromDomHarvest,
} from "../../../capture/tweet-draft";
import { parsePageBlob } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { harvestSource } from "./item-source";
import { inPageTwitterNormalize } from "./normalize";

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx): Capture | null {
  const page = parsePageBlob(raw);
  if (!page) {
    return null;
  }
  return captureFromTweetDraft(
    draftFromDomHarvest({
      source: "twitter",
      id: ctx.sourceId,
      url: ctx.url,
      ...page,
    }),
  );
}

export function buildExpression(tweetId: string): string {
  const normSrc = `(${inPageTwitterNormalize.toString()})()`;
  const fnSrc = harvestSource();
  return `(async () => {
    const norm = ${normSrc};
    const fn = ${fnSrc};
    const tweetId = ${JSON.stringify(tweetId)};
    const articleDeadline = Date.now() + 12_000;
    let article = null;
    while (Date.now() < articleDeadline) {
      const a = document.querySelector('a[href*="/status/' + tweetId + '"]');
      const candidate = a && a.closest('article');
      if (candidate) { article = candidate; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    if (article) {
      /** Twitter lazy-loads grid/carousel images, so the first <img> appears well before the rest; wait until the media element count stays stable or the deadline hits. */
      const countMedia = () => article.querySelectorAll(
        '[data-testid="tweetPhoto"] img, video, [data-testid="videoPlayer"] img, [data-testid="videoComponent"] img'
      ).length;
      const mediaDeadline = Date.now() + 8_000;
      const stableMs = 800;
      let lastCount = 0;
      let stableSince = 0;
      while (Date.now() < mediaDeadline) {
        const count = countMedia();
        if (count > 0) {
          if (count === lastCount) {
            if (stableSince === 0) stableSince = Date.now();
            if (Date.now() - stableSince >= stableMs) break;
          } else {
            lastCount = count;
            stableSince = 0;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    try { return fn(tweetId, norm); } catch (e) { return null; }
  })()`;
}
