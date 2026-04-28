import { useSyncExternalStore } from "react";
import { pool, subscribeToAll, subscribeToId } from "./pool";
import type { Save } from "./types";

/**
 * Subscribe to a single `Save` by id. Returns the same object reference
 * across all views that call `useSave(id)`, so editing the tag list in one
 * place re-renders every list and detail view simultaneously.
 */
export function useSave(id: string | null | undefined): Save | undefined {
  return useSyncExternalStore(
    (cb) => (id ? subscribeToId(id, cb) : () => {}),
    () => (id ? pool.get(id) : undefined),
    () => (id ? pool.get(id) : undefined),
  );
}

/** Subscribe to the whole saves list. */
export function useSaves(): Save[] {
  const snapshot = useSyncExternalStore(
    subscribeToAll,
    () => pool.snapshot(),
    () => pool.snapshot(),
  );
  return snapshot;
}
