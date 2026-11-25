import { saves, tasks } from "@pond/schema/db";
import { ARTICLE_KIND } from "@shared/save-file-names";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { getDb } from "../../db";
import { runHarvestMetadata } from "../pipeline/workers/harvest-metadata";

/** Stays on the harvest task row so a post with no body is fetched once, not on every launch. */
const BACKFILL_MARKER = { backfill: ARTICLE_KIND };

const MarkerSchema = z
  .object({ backfill: z.string().optional().catch(undefined) })
  .catch({});

/** Harvests in place rather than through the queue, which only runs `ingesting` saves and would hide them from the library. */
export async function startArticleBackfill(): Promise<{
  ok: true;
  harvested: number;
}> {
  const db = await getDb();
  const rows = db
    .select({ id: saves.id, files: saves.files })
    .from(saves)
    .where(
      and(
        eq(saves.source, "substack"),
        eq(saves.status, "complete"),
        isNull(saves.deletedAt),
      ),
    )
    .all()
    .filter((row) => !row.files.some((file) => file.kind === ARTICLE_KIND));
  if (rows.length === 0) return { ok: true, harvested: 0 };

  const marked = new Set(
    db
      .select({ saveId: tasks.saveId, payload: tasks.payload })
      .from(tasks)
      .where(
        and(
          eq(tasks.op, "harvest_metadata"),
          inArray(
            tasks.saveId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .all()
      .filter(
        (task) => MarkerSchema.parse(task.payload).backfill === ARTICLE_KIND,
      )
      .map((task) => task.saveId),
  );

  let harvested = 0;
  for (const { id } of rows) {
    if (marked.has(id)) continue;
    try {
      await runHarvestMetadata(id, { force: true });
      db.update(tasks)
        .set({ payload: BACKFILL_MARKER, updatedAt: new Date() })
        .where(and(eq(tasks.saveId, id), eq(tasks.op, "harvest_metadata")))
        .run();
      harvested += 1;
    } catch (error) {
      log.warn("[pond article-backfill] harvest failed", id, error);
    }
  }

  if (harvested > 0) {
    log.info("[pond article-backfill] harvested Substack articles", {
      harvested,
    });
  }
  return { ok: true, harvested };
}
