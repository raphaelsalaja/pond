import { ingestPayloadSchema } from "@pond/schema/ingest";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { enqueueAutoVideoDownload } from "../core/auto-video";
import { ingestFromHttp } from "../core/ingest";

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
    // Only fires when the payload is video-typed; the queue itself
    // gates on `supportsYtDlp(source)` so non-video sources (Pinterest,
    // Are.na, articles) never spawn yt-dlp even if the source class
    // gets bumped here later.
    if (parsed.data.mediaType === "video") {
      enqueueAutoVideoDownload({
        saveId: result.id,
        source: parsed.data.source,
        sourceId: parsed.data.sourceId,
        url: parsed.data.url,
      });
    }

    return c.json({ status: "success", data: result });
  } catch (err) {
    log.error("[pond http] item/add failed", err);
    return c.json({ status: "error", error: String(err) }, 500);
  }
}
