export type LocalRuntime = {
  provider: "ollama" | "lmstudio" | "sapient";
  baseUrl?: string;
};

export type LocalRuntimePriority = "interactive" | "background";

export type LocalRuntimeExecution = {
  signal: AbortSignal;
  cold: boolean;
};

export type LocalRuntimeCoordinationFailure = "aborted" | "timeout";

export class LocalRuntimeCoordinationError extends Error {
  readonly reason: LocalRuntimeCoordinationFailure;

  constructor(reason: LocalRuntimeCoordinationFailure) {
    super(
      reason === "timeout"
        ? "The local model request timed out."
        : "The local model request was canceled.",
    );
    this.name = "LocalRuntimeCoordinationError";
    this.reason = reason;
  }
}

type RunRequest = {
  runtime: LocalRuntime;
  priority: LocalRuntimePriority;
  signal: AbortSignal;
  timeoutMs: number;
};

type QueuedJob = {
  start(): void;
  cancel(reason: LocalRuntimeCoordinationFailure): void;
};

type RuntimeState = {
  active: boolean;
  interactive: QueuedJob[];
  background: QueuedJob[];
};

export interface LocalRuntimeCoordinator {
  run<T>(
    request: RunRequest,
    operation: (execution: LocalRuntimeExecution) => Promise<T>,
  ): Promise<T>;
}

function runtimeKey(runtime: LocalRuntime): string {
  const baseUrl = runtime.baseUrl?.trim().replace(/\/+$/, "") ?? "";
  return `${runtime.provider}\u0000${baseUrl}`;
}

function positiveTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 1;
  return Math.max(1, Math.round(timeoutMs));
}

export function createLocalRuntimeCoordinator(): LocalRuntimeCoordinator {
  const states = new Map<string, RuntimeState>();
  const warmed = new Set<string>();

  function stateFor(key: string): RuntimeState {
    const existing = states.get(key);
    if (existing) return existing;
    const created: RuntimeState = {
      active: false,
      interactive: [],
      background: [],
    };
    states.set(key, created);
    return created;
  }

  function drain(key: string, state: RuntimeState): void {
    if (state.active) return;
    const next = state.interactive.shift() ?? state.background.shift();
    if (!next) {
      states.delete(key);
      return;
    }
    state.active = true;
    next.start();
  }

  return {
    run<T>(
      request: RunRequest,
      operation: (execution: LocalRuntimeExecution) => Promise<T>,
    ) {
      const key = runtimeKey(request.runtime);
      const state = stateFor(key);
      const controller = new AbortController();
      let started = false;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let resolveResult!: (value: T) => void;
      let rejectResult!: (reason: Error) => void;
      const result = new Promise<T>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      const removeFromQueue = (): void => {
        const queue =
          request.priority === "interactive"
            ? state.interactive
            : state.background;
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
      };
      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        request.signal.removeEventListener("abort", onAbort);
      };
      const settleFailure = (reason: LocalRuntimeCoordinationFailure): void => {
        if (settled) return;
        settled = true;
        rejectResult(new LocalRuntimeCoordinationError(reason));
      };
      const finish = (): void => {
        cleanup();
        state.active = false;
        drain(key, state);
      };
      const job: QueuedJob = {
        start() {
          started = true;
          if (controller.signal.aborted) {
            finish();
            return;
          }
          const cold = !warmed.has(key);
          warmed.add(key);
          let running: Promise<T>;
          try {
            running = operation({ signal: controller.signal, cold });
          } catch (error) {
            running = Promise.reject(error);
          }
          running.then(
            (value) => {
              if (!settled) {
                settled = true;
                resolveResult(value);
              }
              finish();
            },
            (error) => {
              if (!settled) {
                settled = true;
                rejectResult(
                  error instanceof Error ? error : new Error(String(error)),
                );
              }
              finish();
            },
          );
        },
        cancel(reason) {
          if (settled) return;
          controller.abort();
          settleFailure(reason);
          if (!started) {
            removeFromQueue();
            cleanup();
            drain(key, state);
          }
        },
      };
      const onAbort = (): void => job.cancel("aborted");

      if (request.signal.aborted) {
        job.cancel("aborted");
        return result;
      }
      request.signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(
        () => job.cancel("timeout"),
        positiveTimeout(request.timeoutMs),
      );
      const queue =
        request.priority === "interactive"
          ? state.interactive
          : state.background;
      queue.push(job);
      drain(key, state);
      return result;
    },
  };
}

export const localRuntimeCoordinator = createLocalRuntimeCoordinator();
