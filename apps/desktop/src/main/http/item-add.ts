import { ingestPayloadSchema } from "@pond/schema/ingest";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { enqueueAutoVideoDownload } from "../core/auto-video";
import { ingestFromHttp } from "../core/ingest";
import { supportsYtDlp } from "../core/refresh/sources";

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
