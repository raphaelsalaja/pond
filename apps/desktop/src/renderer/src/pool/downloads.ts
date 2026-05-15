import { useSyncExternalStore } from "react";

let current: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function publish(next: ReadonlySet<string>): void {
  if (setsEqual(current, next)) return;
  current = next;
  for (const cb of listeners) cb();
}

let bootstrapped = false;
function bootstrap(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  const fn = (
    window.pond as unknown as {
      onVideoDownloadStatus?: (
        cb: (s: { pending: string[]; inFlight: string[] }) => void,
      ) => () => void;
    }
  ).onVideoDownloadStatus;
  if (typeof fn !== "function") {
    console.debug("[pond downloads] onVideoDownloadStatus IPC not available");
    return;
  }
  fn(({ pending, inFlight }) => {
    publish(new Set<string>([...pending, ...inFlight]));
  });
}

function subscribe(cb: () => void): () => void {
  bootstrap();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ReadonlySet<string> {
  bootstrap();
  return current;
}

export function useIsVideoDownloading(
  saveId: string | null | undefined,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (saveId ? getSnapshot().has(saveId) : false),
    () => (saveId ? getSnapshot().has(saveId) : false),
  );
}
