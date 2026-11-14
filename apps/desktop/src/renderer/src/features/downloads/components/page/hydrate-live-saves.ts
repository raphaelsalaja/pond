import { ensureSaves } from "@/features/saves/pool";

const HYDRATION_BATCH_SIZE = 200;

function yieldToRenderer(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function hydrateLiveDownloadSaves(
  ids: readonly string[],
  stopped: () => boolean,
): Promise<void> {
  for (let index = 0; index < ids.length; index += HYDRATION_BATCH_SIZE) {
    if (stopped()) return;
    await ensureSaves(ids.slice(index, index + HYDRATION_BATCH_SIZE));
    if (index + HYDRATION_BATCH_SIZE < ids.length) await yieldToRenderer();
  }
}
