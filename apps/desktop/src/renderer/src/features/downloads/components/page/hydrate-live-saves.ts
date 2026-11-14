import { ensureSaves, pool, reloadSaves } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";

const HYDRATION_BATCH_SIZE = 200;

function yieldToRenderer(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Save events never carry tasks, so a Save that fails between in-flight polls keeps tasks that can't explain it. */
function hasStaleTasks(save: Save): boolean {
  if (!save.tasks) return true;
  return (
    save.status === "failed" &&
    !save.tasks.some(
      (task) =>
        task.status === "dead" ||
        task.status === "blocked" ||
        task.status === "cancelled",
    )
  );
}

export async function hydrateLiveDownloadSaves(
  ids: readonly string[],
  stopped: () => boolean,
): Promise<void> {
  for (let index = 0; index < ids.length; index += HYDRATION_BATCH_SIZE) {
    if (stopped()) return;
    const batch = ids.slice(index, index + HYDRATION_BATCH_SIZE);
    const stale = batch.filter((id) => {
      const save = pool.get(id);
      return save != null && hasStaleTasks(save);
    });
    await ensureSaves(batch);
    if (stale.length > 0) await reloadSaves(stale);
    if (index + HYDRATION_BATCH_SIZE < ids.length) await yieldToRenderer();
  }
}
