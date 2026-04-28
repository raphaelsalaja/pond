import { useSyncExternalStore } from "react";

/**
 * Renderer-side mirror of main's auto-video queue.
 *
 * Holds a single `Set<string>` of save IDs that are currently being
 * materialised by yt-dlp (either pending or in-flight — for the UI
 * indicator the distinction doesn't matter; both mean "spinner on").
 * The set is populated by `pond:auto-video-status` broadcasts from
 * main, with an initial snapshot fired on `did-finish-load` so
 * components mounted on first paint don't have to wait for the next
 * queue mutation.
 *
 * We keep the set as a stable identity until it actually changes so
 * `useSyncExternalStore`-based hooks don't churn re-renders on every
 * unrelated broadcast (e.g. main pushes the same snapshot when the
 * window finishes loading even if nothing is queued).
 */

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
  // Tolerate older preload bundles during dev hot-reload: the IPC
  // landed in the same commit as this file, so a renderer talking to a
  // stale preload would otherwise throw "is not a function" on import.
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

/**
 * Returns true if `saveId` currently has a video being downloaded by
 * yt-dlp in the background. Re-renders the calling component whenever
 * the membership of that single id flips — the underlying store uses
 * a single shared snapshot, so rendering 1000 cards simultaneously
 * subscribing here is still a single broadcast per change.
 */
export function useIsVideoDownloading(
  saveId: string | null | undefined,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (saveId ? getSnapshot().has(saveId) : false),
    () => (saveId ? getSnapshot().has(saveId) : false),
  );
}
