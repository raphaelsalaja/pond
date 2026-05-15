import { notifyAll, pool } from "./pool";
import { applyAction, normalise, type SyncActionEvent } from "./reconcile";
import type { Save } from "./types";

let started = false;
let bootPromise: Promise<void> | null = null;
let bootReady = false;
const readySubs = new Set<() => void>();

export function bootPool(): Promise<void> {
  if (bootPromise) return bootPromise;
  if (started) return Promise.resolve();
  started = true;

  bootPromise = (async () => {
    subscribeToSyncActions();

    try {
      await hydrateFromMain();
    } catch (err) {
      console.warn("[pond pool] hydrate failed", err);
    }

    bootReady = true;
    for (const cb of readySubs) cb();
    readySubs.clear();
  })();

  return bootPromise;
}

export function isBootReady(): boolean {
  return bootReady;
}

export function subscribeBootReady(cb: () => void): () => void {
  if (bootReady) {
    queueMicrotask(cb);
    return () => {};
  }
  readySubs.add(cb);
  return () => {
    readySubs.delete(cb);
  };
}

export function hydratePool(): Promise<void> {
  return bootPool();
}

async function hydrateFromMain(): Promise<void> {
  const rows = (await window.pond.query("saves.list", {})) as Array<
    Partial<Save>
  >;
  const fresh = rows
    .map((row) => normalise(row))
    .filter((r): r is Save => r !== null);

  const freshIds = new Set(fresh.map((s) => s.id));
  const stale: string[] = [];
  for (const id of pool.ids()) {
    if (!freshIds.has(id)) stale.push(id);
  }

  pool.bulkUpsert(fresh, { silent: true });
  for (const id of stale) pool.delete(id, { silent: true });
  notifyAll();
}

let subscribedToSync = false;

export function subscribeToSyncActions(): void {
  if (subscribedToSync) return;
  window.pond.onSyncAction((raw) => {
    try {
      applyAction(raw as SyncActionEvent);
    } catch (err) {
      console.warn("[pond pool] applyAction failed", err, raw);
    }
  });
  subscribedToSync = true;
}

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
