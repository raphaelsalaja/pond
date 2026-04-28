import { notifyAll, pool } from "./pool";
import { applyAction, normalise, type SyncActionEvent } from "./reconcile";
import type { Save } from "./types";

/**
 * First-mount hydration: pull the current saves list from the main
 * process, prime the Object Pool, then subscribe to `sync-action` for
 * the lifetime of the app.
 *
 * Idempotent — calling it twice is a no-op once the subscription is
 * attached.
 */

let subscribed = false;
let hydrated = false;

export async function hydratePool(force = false): Promise<void> {
  if (hydrated && !force) return;
  const rows = (await window.pond.query("saves.list", {
    limit: 1000,
  })) as Array<Partial<Save>>;
  // Run every row through `normalise` so timestamps are guaranteed to be
  // ISO strings regardless of whether main went through the wire
  // serializer (it should, but older dev sessions may not have hot-reloaded).
  const normalised = rows.map(normalise).filter((r): r is Save => r !== null);
  pool.bulkUpsert(normalised);
  hydrated = true;
  notifyAll();
}

export function subscribeToSyncActions(): void {
  if (subscribed) return;
  window.pond.onSyncAction((raw) => {
    try {
      applyAction(raw as SyncActionEvent);
    } catch (err) {
      console.warn("[pond pool] applyAction failed", err, raw);
    }
  });
  subscribed = true;
}

/**
 * Helper for optimistic writes. Mutates the pool, fires the tx, and
 * reverts on failure. Callers should prefer this over calling
 * `window.pond.tx(...)` directly so undo + failure handling stay in one
 * place.
 */
export async function optimistic<T>(
  optimisticUpdate: () => void,
  rollback: () => void,
  run: () => Promise<T>,
): Promise<T | null> {
  optimisticUpdate();
  notifyAll();
  try {
    return await run();
  } catch (err) {
    console.warn("[pond pool] tx failed, rolling back", err);
    rollback();
    notifyAll();
    return null;
  }
}
