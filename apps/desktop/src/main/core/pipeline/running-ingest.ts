const runningIngest = new Map<string, AbortController>();

export function trackRunningIngest(
  taskId: string,
  controller: AbortController,
): void {
  runningIngest.set(taskId, controller);
}

export function untrackRunningIngest(taskId: string): void {
  runningIngest.delete(taskId);
}

export function abortRunningIngest(taskId: string): void {
  const controller = runningIngest.get(taskId);
  if (!controller) return;
  try {
    controller.abort();
  } catch {
    // The controller is already unusable. The task row still has to be cancelled.
  }
}
