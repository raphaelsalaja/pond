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

class PondPool {
  private readonly byId = new Map<string, Save>();
  private cached: Save[] | null = null;
  private version = 0;

  get(id: string): Save | undefined {
    return this.byId.get(id);
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

  upsert(save: Save): void {
    this.byId.set(save.id, save);
    this.cached = null;
    this.version++;
  }

  bulkUpsert(list: Save[]): void {
    for (const save of list) this.byId.set(save.id, save);
    this.cached = null;
    this.version++;
  }

  delete(id: string): void {
    this.byId.delete(id);
    this.cached = null;
    this.version++;
  }

  clear(): void {
    this.byId.clear();
    this.cached = null;
    this.version++;
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
