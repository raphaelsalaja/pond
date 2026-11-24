import type { Save } from "@pond/schema/db";
import log from "electron-log/main.js";
import { readSave } from "./pipeline/workers/apply";
import { getImageDownloadPrefs } from "./prefs";
import { splitsOnImport } from "./split-save-plan";

/** Splits before the save turns complete, so enrichment never scores the whole post first. */
export async function splitNewPost(save: Save): Promise<Save | null> {
  const prefs = await getImageDownloadPrefs(save.source);
  if (!splitsOnImport(save, prefs)) {
    return save;
  }
  const { splitSave } = await import("./split-save");
  try {
    await splitSave(save.id, "system");
  } catch (error) {
    log.warn("[pond pipeline:finalize] split failed, keeping one save", {
      saveId: save.id,
      error,
    });
  }
  return readSave(save.id);
}
