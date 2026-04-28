import { ingestPayloadSchema } from "@pond/schema/ingest";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { ingestFromHttp } from "../core/ingest";

/**
 * `POST /api/v2/item/add` -- what the browser extension calls on every save.
 * Thin wrapper around the TransactionExecutor (see core/ingest.ts). Same Zod
 * schema as the old Next.js `/api/ingest` route so the extension payload
 * didn't have to change.
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
    return c.json({ status: "success", data: result });
  } catch (err) {
    log.error("[pond http] item/add failed", err);
    return c.json({ status: "error", error: String(err) }, 500);
  }
}
