import log from "electron-log/main.js";

export interface JobSnapshot {
  pending: string[];
  inFlight: string[];
}

export type JobStatusListener = (snapshot: JobSnapshot) => void;

export interface JobRunnerOptions<TJob> {
  name: string;
  process: (job: TJob) => Promise<void>;
}

export interface JobRunner<TJob> {
  enqueue(
    key: string,
    job: TJob,
    merge?: (prev: TJob, next: TJob) => TJob,
  ): void;
  has(key: string): boolean;
  snapshot(): JobSnapshot;
  subscribe(cb: JobStatusListener): () => void;
}

// In-memory keyed job runner. Drains asynchronously on setImmediate; one
// job per key — re-enqueueing while the same key is in flight is a no-op
// unless a `merge` callback is provided.
export function createJobRunner<TJob>(
  opts: JobRunnerOptions<TJob>,
): JobRunner<TJob> {
  const { name, process } = opts;
  const pending = new Map<string, TJob>();
  const inFlight = new Set<string>();
  let draining = false;
  const listeners = new Set<JobStatusListener>();

  function snapshot(): JobSnapshot {
    return { pending: [...pending.keys()], inFlight: [...inFlight] };
  }

  function notify(): void {
    if (listeners.size === 0) return;
    const snap = snapshot();
    for (const cb of listeners) {
      try {
        cb(snap);
      } catch (err) {
        log.warn(`[pond ${name}] status listener threw`, err);
      }
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (pending.size > 0) {
        const next = pending.entries().next().value as
          | [string, TJob]
          | undefined;
        if (!next) break;
        const [key, job] = next;
        pending.delete(key);
        inFlight.add(key);
        notify();
        try {
          await process(job);
        } catch (err) {
          log.warn(`[pond ${name}] job threw`, key, err);
        } finally {
          inFlight.delete(key);
          notify();
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    enqueue(key, job, merge) {
      if (!key) return;
      const existing = pending.get(key);
      if (existing) {
        pending.set(key, merge ? merge(existing, job) : existing);
        notify();
        return;
      }
      if (inFlight.has(key)) return;
      pending.set(key, job);
      notify();
      setImmediate(() => {
        void drain();
      });
    },
    has(key) {
      return pending.has(key) || inFlight.has(key);
    },
    snapshot,
    subscribe(cb) {
      listeners.add(cb);
      cb(snapshot());
      return () => listeners.delete(cb);
    },
  };
}

export interface PollingLoopOptions {
  name: string;
  tickMs: number;
  tick: () => Promise<void>;
}

export interface PollingLoop {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

// Interval-driven loop with re-entrancy guard. Used by the enrich worker
// where job state lives in SQLite, so the runner abstraction is just the
// timer + busy flag.
export function createPollingLoop(opts: PollingLoopOptions): PollingLoop {
  const { name, tickMs, tick } = opts;
  let handle: NodeJS.Timeout | null = null;
  let busy = false;

  return {
    start() {
      if (handle) return;
      handle = setInterval(() => {
        if (busy) return;
        busy = true;
        void tick()
          .catch((err) => log.warn(`[pond ${name}] tick error`, err))
          .finally(() => {
            busy = false;
          });
      }, tickMs);
    },
    stop() {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    },
    isRunning() {
      return handle !== null;
    },
  };
}
