import type {
  QueueWorkerJob,
  QueueWorkerRequest,
  QueueWorkerResponse,
} from "./worker-contract";
import { QueueWorkerRequestSchema } from "./worker-contract";

const POOL_SIZE = 2;
const DEFAULT_TIMEOUT_MS = 2 * 60_000;

export interface QueueWorkerProcess {
  onMessage: (listener: (response: QueueWorkerResponse) => void) => void;
  onExit: (listener: (code: number) => void) => void;
  postMessage: (request: QueueWorkerRequest) => void;
  kill: () => void;
}

export interface QueueWorkerHostDependencies {
  spawn: () => QueueWorkerProcess;
  createJobId: () => string;
  validateSourcePath: (path: string) => Promise<boolean>;
  onStopped: () => void;
  /**
   * Runs jobs in this process instead of a utility process. Linux Electron
   * crashes (SIGSEGV) when sharp decodes an image in a utility process, so the
   * host uses this fallback there.
   */
  execute?: (request: QueueWorkerRequest) => Promise<QueueWorkerResponse>;
}

export type QueueWorkerResult = Extract<
  QueueWorkerResponse,
  { ok: true }
>["result"];

interface PendingJob {
  request: QueueWorkerRequest;
  timeoutMs: number;
  signal?: AbortSignal;
  resolve: (value: QueueWorkerResult) => void;
  reject: (error: Error) => void;
  slot: WorkerSlot | null;
  abort: () => void;
}

interface WorkerSlot {
  child: QueueWorkerProcess;
  current: PendingJob | null;
  timeout: NodeJS.Timeout | null;
  stopped: boolean;
}

export function createQueueWorkerHost(deps: QueueWorkerHostDependencies) {
  const slots = new Set<WorkerSlot>();
  const queue: PendingJob[] = [];
  let disposed = false;

  function clearSlotTimeout(slot: WorkerSlot): void {
    if (!slot.timeout) return;
    clearTimeout(slot.timeout);
    slot.timeout = null;
  }

  function detachAbort(job: PendingJob): void {
    job.signal?.removeEventListener("abort", job.abort);
    job.slot = null;
  }

  function failQueued(error: Error): void {
    for (const job of queue.splice(0)) {
      detachAbort(job);
      job.reject(error);
    }
  }

  function settleMessage(
    slot: WorkerSlot,
    response: QueueWorkerResponse,
  ): void {
    const current = slot.current;
    if (!current) return;
    if (
      response.jobId !== current.request.jobId ||
      response.leaseToken !== current.request.leaseToken ||
      response.cancellationFence !== current.request.cancellationFence
    ) {
      return;
    }
    slot.current = null;
    clearSlotTimeout(slot);
    detachAbort(current);
    if (response.ok) current.resolve(response.result);
    else {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      current.reject(error);
    }
    pump();
  }

  function spawnSlot(): WorkerSlot {
    const child = deps.spawn();
    const slot: WorkerSlot = {
      child,
      current: null,
      timeout: null,
      stopped: false,
    };
    slots.add(slot);
    child.onMessage((response) => settleMessage(slot, response));
    child.onExit((code) => {
      slot.stopped = true;
      slots.delete(slot);
      clearSlotTimeout(slot);
      const current = slot.current;
      slot.current = null;
      if (current) {
        detachAbort(current);
        /**
         * A broken image must not freeze its Save: keep the original bytes
         * and retry the rest without dimensions.
         */
        if (
          current.request.operation === "process_image" ||
          current.request.operation === "probe_image"
        )
          current.resolve(null);
        else
          current.reject(
            new Error(
              `Queue worker exited before completing its job (${code}).`,
            ),
          );
      }
      if (!disposed && queue.length > 0) {
        try {
          spawnSlot();
        } catch (error) {
          failQueued(error instanceof Error ? error : new Error(String(error)));
        }
      }
      pump();
    });
    return slot;
  }

  function pump(): void {
    if (disposed) return;
    let idleSlots = [...slots].filter(
      (slot) => !slot.current && !slot.stopped,
    ).length;
    while (slots.size < POOL_SIZE && queue.length > idleSlots) {
      spawnSlot();
      idleSlots += 1;
    }
    for (const slot of slots) {
      if (slot.current || slot.stopped) continue;
      const job = queue.shift();
      if (!job) return;
      if (job.signal?.aborted) {
        detachAbort(job);
        job.reject(new Error("Queue worker job aborted."));
        continue;
      }
      slot.current = job;
      job.slot = slot;
      slot.timeout = setTimeout(() => {
        if (slot.current === job) slot.child.kill();
      }, job.timeoutMs);
      slot.child.postMessage(job.request);
    }
  }

  async function run(
    job: QueueWorkerJob,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<QueueWorkerResult> {
    if (disposed) throw new Error("Queue worker host is disposed.");
    if (
      job.operation === "build_poster" &&
      !(await deps.validateSourcePath(job.sourcePath))
    ) {
      throw new Error("Queue worker source path must be an absolute file.");
    }
    const request = QueueWorkerRequestSchema.parse({
      ...job,
      jobId: deps.createJobId(),
    });
    if (deps.execute) {
      if (options.signal?.aborted) throw new Error("Queue worker job aborted.");
      const response = await deps.execute(request);
      if (response.ok) return response.result;
      const error = new Error(response.error.message);
      error.name = response.error.name;
      throw error;
    }
    return new Promise<QueueWorkerResult>((resolve, reject) => {
      const pending: PendingJob = {
        request,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: options.signal,
        resolve,
        reject,
        slot: null,
        abort: () => {
          const queuedIndex = queue.indexOf(pending);
          if (queuedIndex >= 0) {
            queue.splice(queuedIndex, 1);
            detachAbort(pending);
            reject(new Error("Queue worker job aborted."));
            return;
          }
          pending.slot?.child.kill();
        },
      };
      options.signal?.addEventListener("abort", pending.abort, { once: true });
      queue.push(pending);
      try {
        pump();
      } catch (error) {
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
        detachAbort(pending);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    failQueued(new Error("Queue worker host stopped."));
    for (const slot of slots) {
      slot.stopped = true;
      clearSlotTimeout(slot);
      const current = slot.current;
      slot.current = null;
      if (current) {
        detachAbort(current);
        current.reject(new Error("Queue worker host stopped."));
      }
      slot.child.kill();
    }
    slots.clear();
    deps.onStopped();
  }

  return { run, dispose };
}
