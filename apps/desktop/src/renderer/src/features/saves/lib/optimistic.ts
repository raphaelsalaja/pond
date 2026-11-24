import log from "electron-log/renderer";

export async function optimistic<T>(
  optimisticUpdate: () => void,
  rollback: () => void,
  run: () => Promise<T>,
): Promise<T | null> {
  optimisticUpdate();
  try {
    return await run();
  } catch (error) {
    log.warn("[pond pool] tx failed, rolling back", error);
    rollback();
    return null;
  }
}
