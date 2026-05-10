import { bulkDeleteCache, bulkPutCache, loadAllFromCache } from "./cache";
import { notifyAll, pool, subscribeDirty } from "./pool";
import { applyAction, normalise, type SyncActionEvent } from "./reconcile";
import type { Save } from "./types";

/**
 * Boot orchestration for the renderer's Object Pool.
 *
 * The flow on every launch:
 *
 *  1. Read the IndexedDB mirror of the pool. This is the equivalent of
 *     a Linear-style local store — same machine, no IPC, returns in a
 *     handful of ms even for ~100k rows. The pool is seeded silently
 *     so we don't immediately rewrite the rows we just read.
 *  2. Subscribe to `sync-action` events from main so any executor
 *     output that lands while we reconcile is applied in order.
 *  3. Reconcile: ask main for the live `saves.list` snapshot. Compute
 *     the diff against the pool (ids missing-in-fresh → delete, fresh
 *     rows → upsert) and apply silently, then write the new state to
 *     the cache directly.
 *  4. Attach a debounced flush so every subsequent mutation — sync
 *     action, optimistic write — drains `pool.drainDirty()` into the
 *     cache.
 *
 * Steps (1) and (2) are synchronous-ish from the renderer's point of
 * view: by the time React's first effect runs the pool is usually
 * already populated, so the library paints from cache on frame 1.
 */

const FLUSH_DEBOUNCE_MS = 500;

let started = false;
let bootPromise: Promise<void> | null = null;
let bootReady = false;
const readySubs = new Set<() => void>();

export function bootPool(): Promise<void> {
  if (bootPromise) return bootPromise;
  if (started) return Promise.resolve();
  started = true;

  bootPromise = (async () => {
    // 1. Cache → pool. Failure is non-fatal; we just paint empty until
    //    the live query lands.
    try {
      const cached = await loadAllFromCache();
      if (cached.length > 0) {
        const normalised = cached
          .map((row) => normalise(row as Partial<Save>))
          .filter((r): r is Save => r !== null);
        pool.bulkUpsert(normalised, { silent: true });
        notifyAll();
      }
    } catch (err) {
      console.warn("[pond pool] cache load failed", err);
    }

    // 2. Open the sync-action stream before we reconcile so any events
    //    arriving mid-reconcile go through `applyAction` and end up in
    //    the dirty queue we attach in step (4).
    subscribeToSyncActions();

    // 3. Reconcile against SQLite. This is the only IPC round-trip on
    //    boot; the user has already seen frame 1.
    try {
      await reconcileWithMain();
    } catch (err) {
      console.warn("[pond pool] reconcile failed", err);
    }

    // 4. Attach the cache flush. Anything dirty *before* this point —
    //    e.g. sync actions that landed while the cache load was in
    //    flight — is still in the dirty queue, so we flush once
    //    eagerly to bring the cache in line.
    attachCacheFlush();
    void flushDirty();

    // 5. Flip the boot-ready flag last so any UI that waits on
    //    "we know whether the pool is empty for real" can render its
    //    real empty state — instead of flashing one while the cache
    //    load + reconcile are still in flight.
    bootReady = true;
    for (const cb of readySubs) cb();
    readySubs.clear();
  })();

  return bootPromise;
}

/** True once `bootPool()` has finished its first cache + reconcile pass. */
export function isBootReady(): boolean {
  return bootReady;
}

/**
 * Fire `cb` once when `bootPool()` resolves. If boot has already
 * finished, the callback is invoked on the next microtask. The
 * returned unsubscribe handle is a no-op after the callback fires.
 */
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

/**
 * Back-compat alias. Older code paths called `hydratePool()` and
 * awaited its resolution; that's now a synonym for the cached boot
 * promise so any in-flight migration keeps working.
 */
export function hydratePool(): Promise<void> {
  return bootPool();
}

async function reconcileWithMain(): Promise<void> {
  const rows = (await window.pond.query("saves.list", {
    limit: 1000,
  })) as Array<Partial<Save>>;
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

  // Bring the cache in line with the fresh snapshot directly. Doing
  // this here (rather than via the dirty queue) keeps the cache write
  // bounded — `O(fresh + stale)` once — instead of streaming a put
  // for every reconciled row.
  void bulkPutCache(fresh);
  if (stale.length > 0) void bulkDeleteCache(stale);
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

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushAttached = false;
let flushing = false;

function attachCacheFlush(): void {
  if (flushAttached) return;
  flushAttached = true;
  subscribeDirty(() => {
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushDirty();
    }, FLUSH_DEBOUNCE_MS);
  });
}

async function flushDirty(): Promise<void> {
  if (flushing) return;
  if (!pool.hasDirty()) return;
  flushing = true;
  try {
    const { puts, deletes } = pool.drainDirty();
    if (puts.length > 0) {
      try {
        await bulkPutCache(puts);
      } catch (err) {
        console.warn("[pond pool] cache put failed", err);
      }
    }
    if (deletes.length > 0) {
      try {
        await bulkDeleteCache(deletes);
      } catch (err) {
        console.warn("[pond pool] cache delete failed", err);
      }
    }
  } finally {
    flushing = false;
  }
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
