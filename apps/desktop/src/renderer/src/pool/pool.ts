import type { Save } from "./types";

/**
 * In-memory Object Pool — the engine that makes the UI feel instant.
 *
 * Rules:
 *  - ONE `Save` instance per id, shared across every view.
 *  - Components subscribe via `useSyncExternalStore` to an id (fine-grained)
 *    or to the whole list (coarse).
 *  - The executor in main emits `sync-action` events; we reconcile here.
 *  - Writes in the UI mutate the pool SYNCHRONOUSLY, then fire
 *    `window.pond.tx(...)`. If the tx fails the executor throws and the
 *    pool is rolled back via the catch path in the caller.
 *
 * See plan § "Transactions, Object Pool & sync actions".
 */

interface MutateOpts {
  /**
   * Skip dirty tracking for this mutation. Used by the cache hydration
   * path, where the rows we're putting into the pool came *from* the
   * cache and writing them back would be redundant work.
   */
  silent?: boolean;
}

class PondPool {
  private readonly byId = new Map<string, Save>();
  private cached: Save[] | null = null;
  private version = 0;
  /** Ids whose newest state hasn't been flushed to the local cache. */
  private readonly pendingPuts = new Set<string>();
  /** Ids that were deleted and need removing from the local cache. */
  private readonly pendingDeletes = new Set<string>();

  get(id: string): Save | undefined {
    return this.byId.get(id);
  }

  ids(): IterableIterator<string> {
    return this.byId.keys();
  }

  snapshot(): Save[] {
    if (!this.cached) {
      // Most-recent-first. We compare by milliseconds rather than via
      // `localeCompare` so the sort stays correct even if `savedAt`
      // arrives as a Date, number, or number-in-a-string from a
      // mis-serialised payload. `Number.NaN` sinks to the bottom so
      // malformed rows don't corrupt the rest of the list.
      this.cached = Array.from(this.byId.values()).sort(
        (a, b) => savedAtMs(b) - savedAtMs(a),
      );
    }
    return this.cached;
  }

  getVersion(): number {
    return this.version;
  }

  upsert(save: Save, opts?: MutateOpts): void {
    const prev = this.byId.get(save.id);
    this.byId.set(save.id, save);
    this.version++;
    if (!opts?.silent) this.markDirty(save.id);

    // Insert or savedAt-changed: ordering shifted, rebuild on next snapshot.
    if (!prev || savedAtMs(prev) !== savedAtMs(save)) {
      this.cached = null;
      return;
    }

    // In-place update: same id, same position. Patch the cached array so
    // every other save reference stays stable (React.memo'd cards bail
    // without re-rendering) but the array itself becomes a new reference
    // (useSaves consumers re-run filters and see the updated row).
    // Cheaper than the O(n log n) re-sort the next snapshot would run.
    if (this.cached) {
      const idx = this.cached.indexOf(prev);
      if (idx >= 0) {
        const next = this.cached.slice();
        next[idx] = save;
        this.cached = next;
      } else {
        this.cached = null;
      }
    }
  }

  bulkUpsert(list: Save[], opts?: MutateOpts): void {
    for (const save of list) {
      this.byId.set(save.id, save);
      if (!opts?.silent) this.markDirty(save.id);
    }
    this.cached = null;
    this.version++;
  }

  delete(id: string, opts?: MutateOpts): void {
    this.byId.delete(id);
    this.cached = null;
    this.version++;
    if (!opts?.silent) this.markDeleted(id);
  }

  clear(): void {
    for (const id of this.byId.keys()) this.markDeleted(id);
    this.byId.clear();
    this.cached = null;
    this.version++;
  }

  /**
   * Drain the queue of pending cache writes since the last drain. The
   * caller is responsible for applying both arrays to the durable cache.
   * After draining, the pool considers itself in-sync until the next
   * mutation.
   */
  drainDirty(): { puts: Save[]; deletes: string[] } {
    const puts: Save[] = [];
    for (const id of this.pendingPuts) {
      const save = this.byId.get(id);
      if (save) puts.push(save);
    }
    const deletes = Array.from(this.pendingDeletes);
    this.pendingPuts.clear();
    this.pendingDeletes.clear();
    return { puts, deletes };
  }

  hasDirty(): boolean {
    return this.pendingPuts.size > 0 || this.pendingDeletes.size > 0;
  }

  private markDirty(id: string): void {
    this.pendingPuts.add(id);
    this.pendingDeletes.delete(id);
    notifyDirty();
  }

  private markDeleted(id: string): void {
    this.pendingDeletes.add(id);
    this.pendingPuts.delete(id);
    notifyDirty();
  }
}

export const pool = new PondPool();

function savedAtMs(save: Save): number {
  const v = save.savedAt as unknown;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

const idSubs = new Map<string, Set<() => void>>();
const listSubs = new Set<() => void>();
const dirtySubs = new Set<() => void>();

export function subscribeToId(id: string, cb: () => void): () => void {
  let set = idSubs.get(id);
  if (!set) {
    set = new Set();
    idSubs.set(id, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) idSubs.delete(id);
  };
}

export function subscribeToAll(cb: () => void): () => void {
  listSubs.add(cb);
  return () => listSubs.delete(cb);
}

export function notifyId(id: string): void {
  idSubs.get(id)?.forEach((cb) => {
    cb();
  });
  listSubs.forEach((cb) => {
    cb();
  });
}

export function notifyAll(): void {
  listSubs.forEach((cb) => {
    cb();
  });
  idSubs.forEach((set) => {
    set.forEach((cb) => {
      cb();
    });
  });
}

/**
 * Subscribe to "the pool has unflushed cache writes". Fires on every
 * non-silent mutation; consumers are expected to debounce and call
 * `pool.drainDirty()` to read + clear the queue.
 */
export function subscribeDirty(cb: () => void): () => void {
  dirtySubs.add(cb);
  return () => dirtySubs.delete(cb);
}

function notifyDirty(): void {
  dirtySubs.forEach((cb) => {
    cb();
  });
}
