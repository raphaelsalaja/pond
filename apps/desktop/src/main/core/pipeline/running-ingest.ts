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

export function abortAllRunningIngest(reason: Error): void {
  for (const controller of runningIngest.values()) {
    controller.abort(reason);
  }
}
