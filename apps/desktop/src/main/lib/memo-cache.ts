interface MemoCacheOptions {
  ttlMs?: number;
}

interface MemoCache<T> {
  get(): Promise<T>;
  peek(): T | null;
  set(value: T): void;
  invalidate(): void;
}

export function createMemoCache<T>(
  compute: () => Promise<T>,
  options: MemoCacheOptions = {},
): MemoCache<T> {
  const ttlMs = options.ttlMs ?? Number.POSITIVE_INFINITY;
  let entry: { value: T; computedAtMs: number } | null = null;
  let inflight: Promise<T> | null = null;

  function fresh(): boolean {
    if (!entry) return false;
    return Date.now() - entry.computedAtMs < ttlMs;
  }

  return {
    async get() {
      if (entry && fresh()) return entry.value;
      if (inflight) return inflight;
      inflight = (async () => {
        const value = await compute();
        entry = { value, computedAtMs: Date.now() };
        return value;
      })();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    peek() {
      return entry && fresh() ? entry.value : null;
    },
    set(value: T) {
      entry = { value, computedAtMs: Date.now() };
    },
    invalidate() {
      entry = null;
      inflight = null;
    },
  };
}
