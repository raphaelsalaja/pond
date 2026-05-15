import { useSyncExternalStore } from "react";
import { isBootReady, subscribeBootReady } from "./bootstrap";
import { pool, subscribeToAll, subscribeToId } from "./pool";
import type { Save } from "./types";

export function useSave(id: string | null | undefined): Save | undefined {
  return useSyncExternalStore(
    (cb) => (id ? subscribeToId(id, cb) : () => {}),
    () => (id ? pool.get(id) : undefined),
    () => (id ? pool.get(id) : undefined),
  );
}

export function useSaves(): Save[] {
  const snapshot = useSyncExternalStore(
    subscribeToAll,
    () => pool.snapshot(),
    () => pool.snapshot(),
  );
  return snapshot;
}

export function useBootReady(): boolean {
  return useSyncExternalStore(subscribeBootReady, isBootReady, isBootReady);
}
