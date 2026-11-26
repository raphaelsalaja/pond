import type { WireSyncAction } from "@shared/wire";

type SyncModelName = WireSyncAction["modelName"];

export interface SyncRefetchOptions {
  /** Only actions on these models trigger a refetch. */
  models: ReadonlyArray<SyncModelName>;
  /** Trailing delay that gathers a burst of actions into one refetch. */
  delayMs: number;
  run: () => Promise<void>;
  /** Defaults to the preload sync action stream. */
  subscribe?: (listener: (action: WireSyncAction) => void) => () => void;
}

/**
 * Main sends one sync action per changed row, so ingest and Sync emit many per second.
 * A refetch runs at most once at a time; actions that arrive while it runs schedule one more
 * afterwards, so main never queues overlapping copies of the same query.
 */
export function onSyncRefetch(options: SyncRefetchOptions): () => void {
  const { models, delayMs, run } = options;
  const subscribe =
    options.subscribe ?? ((listener) => window.pond.onSyncAction(listener));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirty = false;
  let stopped = false;

  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delayMs);
  };

  const flush = async () => {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    dirty = false;
    try {
      await run();
    } catch {
      /** Callers log their own failures; a failed refetch must not stop later ones. */
    } finally {
      running = false;
      if (dirty) schedule();
    }
  };

  const unsubscribe = subscribe((action) => {
    if (!models.includes(action.modelName)) return;
    if (running) {
      dirty = true;
      return;
    }
    schedule();
  });

  return () => {
    stopped = true;
    unsubscribe();
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
}
