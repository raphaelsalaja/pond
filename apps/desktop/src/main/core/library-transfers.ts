import { AsyncLocalStorage } from "node:async_hooks";

const active = new Set<Promise<void>>();
let paused = false;
const scope = new AsyncLocalStorage<{ active: boolean }>();

export async function runLibraryTransfer<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (scope.getStore()?.active) {
    return operation();
  }
  if (paused) {
    throw new Error("The library is changing. Try again when it opens.");
  }
  const context = { active: true };
  const result = Promise.resolve().then(() => scope.run(context, operation));
  const settled = result.then(
    () => {},
    () => {},
  );
  active.add(settled);
  try {
    return await result;
  } finally {
    context.active = false;
    active.delete(settled);
  }
}

export function libraryTransfersRunning(): boolean {
  return active.size > 0;
}

export async function stopLibraryTransfers(): Promise<void> {
  paused = true;
  await Promise.all(active);
}

export function resumeLibraryTransfers(): void {
  paused = false;
}
