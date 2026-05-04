import { ingestPayloadSchema } from "@pond/schema/ingest";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { enqueueAutoVideoDownload } from "../core/auto-video";
import { ingestFromHttp } from "../core/ingest";
import { supportsYtDlp } from "../core/refresh/sources";

/**
 * `POST /api/v2/item/add` -- what the browser extension calls on every save.
 * Thin wrapper around the TransactionExecutor (see core/ingest.ts). Same Zod
 * schema as the old Next.js `/api/ingest` route so the extension payload
 * didn't have to change.
 *
 * Two-stage save flow for video sources (YouTube, TikTok, public Twitter
 * video, IG Reel, Cosmos video):
 *   1. `ingestFromHttp` runs synchronously inside this request and
 *      downloads the poster JPG (`mediaUrl`) into `cover.jpg` so the
 *      card paints a real thumbnail the instant the extension's POST
 *      resolves — no spinner-on-grey.
 *   2. `enqueueAutoVideoDownload` schedules a background job to run
 *      yt-dlp and merge the playable bytes in via a follow-up `update`
 *      transaction. The HTTP response goes out before that work
 *      starts.
 */
export async function itemAddHandler(c: Context) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ status: "error", error: "invalid json body" }, 400);
  }

  const parsed = ingestPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("[pond http] item/add validation failed", parsed.error.flatten());
    return c.json({ status: "error", error: parsed.error.flatten() }, 400);
  }

  try {
    const result = await ingestFromHttp(parsed.data);

    // Background video materialisation. Fire-and-forget — `enqueue` is
    // synchronous and bounces the actual download onto the next tick of
    // the event loop, so this branch never delays the HTTP response.
    // The queue itself gates on `supportsYtDlp(source)` so non-video
    // sources (Pinterest, Are.na, articles) never spawn yt-dlp even if
    // the gate below loosens up later.
    const probe = shouldProbeForVideo(parsed.data);
    if (probe.enqueue) {
      enqueueAutoVideoDownload({
        saveId: result.id,
        source: parsed.data.source,
        sourceId: parsed.data.sourceId,
        url: parsed.data.url,
        force: probe.force,
      });
    }

    return c.json({ status: "success", data: result });
  } catch (err) {
    log.error("[pond http] item/add failed", err);
    return c.json({ status: "error", error: String(err) }, 500);
  }
}

/**
 * Decide whether the auto-video queue should take a swing at this
 * save. Mirrors the more permissive logic the desktop refresh path
 * uses (`maybeDownloadVideo` in `core/refresh/index.ts`) so the
 * extension save path doesn't silently miss reels the in-page scraper
 * misclassified.
 *
 * Why this is wider than `mediaType === "video"`:
 *   The Instagram extension scraper sniffs the DOM for `<video>` to
 *   classify a post. Instagram lazy-mounts the `<video>` element only
 *   once the user hovers / scrolls the post into view; before that, an
 *   IG reel is rendered as a static `<img>` poster inside the article
 *   tag. A user who clicks Save while the post is still in poster mode
 *   ships us `mediaType: "image"` for what is actually a reel. With
 *   the old strict gate yt-dlp never ran and the saved card was stuck
 *   as a still image forever.
 *
 * Heuristic:
 *   - Explicit `mediaType === "video"` always probes (current behaviour).
 *   - Source must be in `supportsYtDlp` for any other case (no point
 *     spinning up the binary on Pinterest pins).
 *   - A *single* image on a yt-dlp source is treated as ambiguous —
 *     could be a reel poster the scraper missed, or a photo post.
 *     yt-dlp returns null cleanly on a real photo, so the worst case
 *     is one wasted background spawn per IG photo save.
 *   - A *multi*-image carousel (`mediaUrls.length > 1`) is conclusive
 *     evidence the post is a photo album and skips the probe.
 *   - Article / link-style payloads skip — the scraper already gave up
 *     on finding media so we shouldn't either.
 *   - Instagram `/reel/` URLs always probe with `force: true` since
 *     the URL kind itself proves the post is a video.
 */
function shouldProbeForVideo(payload: {
  source: ReturnType<typeof ingestPayloadSchema.parse>["source"];
  url: string;
  mediaType?: "image" | "video" | "link" | "article" | null;
  mediaUrls?: ReadonlyArray<unknown>;
}): { enqueue: boolean; force?: boolean } {
  if (payload.mediaType === "video") {
    return { enqueue: true };
  }
  if (!supportsYtDlp(payload.source)) return { enqueue: false };

  const isReelUrl =
    payload.source === "instagram" && /\/reel\//i.test(payload.url);
  if (isReelUrl) {
    return { enqueue: true, force: true };
  }

  if (payload.mediaType === "article") return { enqueue: false };
  const mediaCount = payload.mediaUrls?.length ?? 0;
  if (payload.mediaType === "image" && mediaCount > 1) {
    return { enqueue: false };
  }
  return { enqueue: true };
}
