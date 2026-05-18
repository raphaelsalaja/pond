import { saves, tasks } from "@pond/schema/db";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { resetTasksForSave } from "../pipeline/enqueue";

export type RefreshOutcome =
  | { ok: true; method: "pipeline-reset" }
  | {
      ok: false;
      reason: "not_found" | "no_url" | "internal_error";
    };

// refreshSave — in the URL-first world there is no distinct "refresh"
// pipeline. Refreshing a save means resetting its task rows back to
// `pending` and bumping the reconciler; the harvest_metadata worker will
// re-run with `force: true` so even fresh captures get re-harvested.
export async function refreshSave(saveId: string): Promise<RefreshOutcome> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };

  try {
    db.update(tasks)
      .set({
        payload: { force: true },
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "harvest_metadata")))
      .run();
    await resetTasksForSave(saveId, "user:refresh");
    return { ok: true, method: "pipeline-reset" };
  } catch (err) {
    log.error("[pond refresh] reset failed", saveId, err);
    return { ok: false, reason: "internal_error" };
  }
}

export {
  disconnectSource,
  isSourceConnected,
  signInToSource,
} from "./scrape-window";
