import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { z } from "zod";
import {
  captureFromTweetDraft,
  draftFromDomHarvest,
  draftFromRichPost,
} from "../../../capture/tweet-draft";
import { type HarvestAdaptCtx, parsePageBlob } from "../from-page";
import { draftFromRichTweet } from "./draft";
import { parseBookmarksResponses } from "./graphql";
import { harvestSource } from "./item-source";
import { inPageTwitterNormalize } from "./normalize";

/** The post page's own TweetResultByRestId/TweetDetail bodies, which the preload hook keeps. */
const TweetResponsesSchema = z.object({
  tweetResponses: z.array(z.string()).min(1),
});

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx): Capture | null {
  const responses = TweetResponsesSchema.safeParse(raw);
  if (responses.success) {
    const rich = parseBookmarksResponses(
      responses.data.tweetResponses.map((body) => ({ url: ctx.url, body })),
    ).get(ctx.sourceId);
    return rich
      ? captureFromTweetDraft(draftFromRichPost(draftFromRichTweet(rich)))
      : null;
  }
  const page = parsePageBlob(raw);
  if (!page) return null;
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
    /** x-web has no test ids to scrape, so prefer the post's GraphQL response the preload hook keeps. */
    const responseDeadline = Date.now() + 10_000;
    while (Date.now() < responseDeadline) {
      const bodies = (globalThis.__pondTweetCaptures || [])
        .map((c) => c && c.body)
        .filter((b) => typeof b === 'string' && b.includes('"rest_id":"' + tweetId + '"'));
      if (bodies.length > 0) return { tweetResponses: bodies };
      await new Promise(r => setTimeout(r, 250));
    }
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
