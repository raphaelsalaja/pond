interface Disposable {
  dispose(): void | Promise<void>;
}

export interface IdleResourceInput<T extends Disposable> {
  load: () => Promise<T>;
  idleMs: number;
  schedule: (run: () => void, ms: number) => () => void;
}

export interface IdleResource<T> {
  use<R>(run: (value: T) => Promise<R>): Promise<R>;
  release(): Promise<void>;
}

/** Loads a resource on first use and disposes it once no use has run for `idleMs`. */
export function createIdleResource<T extends Disposable>({
  load,
  idleMs,
  schedule,
}: IdleResourceInput<T>): IdleResource<T> {
  let pending: Promise<T> | null = null;
  let active = 0;
  let cancelIdle: (() => void) | null = null;

  function stopIdle(): void {
    cancelIdle?.();
    cancelIdle = null;
  }

  function disposeNow(): Promise<void> {
    stopIdle();
    const current = pending;
    pending = null;
    if (!current) return Promise.resolve();
    return current.then((value) => value.dispose()).catch(() => undefined);
  }

  function loaded(): Promise<T> {
    if (pending) return pending;
    const loading = load();
    pending = loading;
    loading.catch(() => {
      if (pending === loading) pending = null;
    });
    return loading;
  }

  return {
    async use(run) {
      stopIdle();
      active += 1;
      try {
        return await run(await loaded());
      } finally {
        active -= 1;
        if (active === 0) {
          cancelIdle = schedule(() => {
            cancelIdle = null;
            if (active === 0) void disposeNow();
          }, idleMs);
        }
      }
    },
    release() {
      if (active > 0) return Promise.resolve();
      return disposeNow();
    },
  };
}
