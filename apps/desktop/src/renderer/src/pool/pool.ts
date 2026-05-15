import type { Save } from "./types";

interface MutateOpts {
  silent?: boolean;
}

class PondPool {
  private readonly byId = new Map<string, Save>();
  private cached: Save[] | null = null;
  private version = 0;

  get(id: string): Save | undefined {
    return this.byId.get(id);
  }

  ids(): IterableIterator<string> {
    return this.byId.keys();
  }

  snapshot(): Save[] {
    if (!this.cached) {
      this.cached = Array.from(this.byId.values()).sort(
        (a, b) => savedAtMs(b) - savedAtMs(a),
      );
    }
    return this.cached;
  }

  getVersion(): number {
    return this.version;
  }

  upsert(save: Save, _opts?: MutateOpts): void {
    const prev = this.byId.get(save.id);
    this.byId.set(save.id, save);
    this.version++;

    if (!prev || savedAtMs(prev) !== savedAtMs(save)) {
      this.cached = null;
      return;
    }

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

  bulkUpsert(list: Save[], _opts?: MutateOpts): void {
    for (const save of list) {
      this.byId.set(save.id, save);
    }
    this.cached = null;
    this.version++;
  }

  delete(id: string, _opts?: MutateOpts): void {
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
  const v = save.savedAt;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
