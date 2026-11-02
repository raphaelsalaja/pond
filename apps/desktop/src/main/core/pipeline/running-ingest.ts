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
  runningIngest.get(taskId)?.abort();
}
