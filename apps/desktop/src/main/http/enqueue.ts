import { saves } from "@pond/schema/db";
import { enqueueRequestSchema } from "@pond/schema/ingest";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import type { Context } from "hono";
import { addSavesToFolder } from "../core/folders";
import { UnsupportedError } from "../core/pipeline/extractors/errors";
import { setSaveTags } from "../core/tags";
import { getDb } from "../db";
import { enqueue } from "../ops";
import type { EnqueueOptions } from "../ops";
import { apiError, invalidRequest } from "./errors";

export async function enqueueHandler(c: Context) {
  const parsed = enqueueRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    log.warn("[pond http] enqueue validation failed", parsed.error.flatten());
    return invalidRequest(c, parsed.error);
  }

  try {
    const cookies = parsed.data.cookies;
    const options: EnqueueOptions = {};
    if (parsed.data.trigger) options.trigger = parsed.data.trigger;
    if (cookies && cookies.length > 0) options.cookies = cookies;
    const result = await enqueue(parsed.data.url, options);
    if (parsed.data.tags?.length) {
      const [row] = await (
        await getDb()
      )
        .select({ tags: saves.tags })
        .from(saves)
        .where(eq(saves.id, result.id))
        .limit(1);
      await setSaveTags(result.id, [...(row?.tags ?? []), ...parsed.data.tags]);
    }
    if (parsed.data.folderId) {
      await addSavesToFolder(parsed.data.folderId, [result.id]);
    }
    const [row] = await (
      await getDb()
    )
      .select({ status: saves.status })
      .from(saves)
      .where(eq(saves.id, result.id))
      .limit(1);
    return c.json({
      status: "success",
      data: { ...result, status: row?.status ?? "ingesting" },
    });
  } catch (error) {
    if (error instanceof UnsupportedError) {
      return apiError(
        c,
        "unsupported_url",
        "Pond can't save from this link yet.",
      );
    }
    throw error;
  }
}
