import { expect, it } from "vitest";
import type {
  QueueWorkerRequest,
  QueueWorkerResponse,
} from "./worker-contract";
import {
  createQueueWorkerHost,
  type QueueWorkerProcess,
} from "./worker-host-core";

class FakeWorkerProcess implements QueueWorkerProcess {
  readonly requests: QueueWorkerRequest[] = [];
  private messageListener: ((response: QueueWorkerResponse) => void) | null =
    null;
  private exitListener: ((code: number) => void) | null = null;

  onMessage(listener: (response: QueueWorkerResponse) => void): void {
    this.messageListener = listener;
  }

  onExit(listener: (code: number) => void): void {
    this.exitListener = listener;
  }

  postMessage(request: QueueWorkerRequest): void {
    this.requests.push(request);
  }

  killed = false;

  kill(): void {
    this.killed = true;
    this.exitListener?.(1);
  }

  exit(code: number): void {
    this.exitListener?.(code);
  }

  complete(): void {
    const request = this.requests[0];
    if (!request) throw new Error("Worker did not receive a request.");
    this.messageListener?.({
      jobId: request.jobId,
      leaseToken: request.leaseToken,
      cancellationFence: request.cancellationFence,
      ok: true,
      result: null,
    });
  }
}

function job(leaseToken: string) {
  return {
    operation: "build_poster" as const,
    sourcePath: "/tmp/poster.mp4",
    filename: "poster.jpg",
    leaseToken,
    cancellationFence: 0,
  };
}

it("replaces a dead worker and continues queued jobs", async () => {
  const workers: FakeWorkerProcess[] = [];
  let nextJobId = 0;
  const host = createQueueWorkerHost({
    spawn: () => {
      const worker = new FakeWorkerProcess();
      workers.push(worker);
      return worker;
    },
    createJobId: () => `job-${nextJobId++}`,
    validateSourcePath: async () => true,
    onStopped: () => {},
  });

  const first = host.run(job("first"));
  const second = host.run(job("second"));
  const third = host.run(job("third"));

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(workers).toHaveLength(2);
  workers[0]?.exit(9);
  await expect(first).rejects.toThrow(
    "Queue worker exited before completing its job (9).",
  );
  expect(workers).toHaveLength(3);

  const secondWorker = workers[1];
  const replacement = workers[2];
  if (!secondWorker || !replacement) throw new Error("Missing worker.");
  secondWorker.complete();
  replacement.complete();

  await expect(second).resolves.toBeNull();
  await expect(third).resolves.toBeNull();
  host.dispose();
});

it("keeps media when an image worker dies instead of failing the save", async () => {
  const workers: FakeWorkerProcess[] = [];
  const host = createQueueWorkerHost({
    spawn: () => {
      const worker = new FakeWorkerProcess();
      workers.push(worker);
      return worker;
    },
    createJobId: () => "job",
    validateSourcePath: async () => true,
    onStopped: () => {},
  });

  const image = host.run({
    operation: "probe_image",
    bytes: new Uint8Array([1]),
    leaseToken: "image",
    cancellationFence: 0,
  });

  workers[0]?.exit(139);
  await expect(image).resolves.toBeNull();
  host.dispose();
});

function idleHarness() {
  const workers: FakeWorkerProcess[] = [];
  const timers: Array<{ run: () => void; cancelled: boolean }> = [];
  let nextJobId = 0;
  const host = createQueueWorkerHost({
    spawn: () => {
      const worker = new FakeWorkerProcess();
      workers.push(worker);
      return worker;
    },
    createJobId: () => `job-${nextJobId++}`,
    validateSourcePath: async () => true,
    onStopped: () => {},
    scheduleIdle: (run) => {
      const timer = { run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const fireIdle = () => {
    for (const timer of timers.splice(0)) {
      if (!timer.cancelled) timer.run();
    }
  };
  const killed = () => workers.filter((worker) => worker.killed);
  return { host, workers, killed, fireIdle };
}

it("stops an idle worker and spawns a fresh one for the next job", async () => {
  const { host, workers, killed, fireIdle } = idleHarness();

  const first = host.run(job("first"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  workers[0]?.complete();
  await expect(first).resolves.toBeNull();

  fireIdle();
  expect(killed()).toEqual([workers[0]]);

  const second = host.run(job("second"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(workers).toHaveLength(2);
  workers[1]?.complete();
  await expect(second).resolves.toBeNull();
  host.dispose();
});

it("keeps a worker that receives a job before it goes idle", async () => {
  const { host, workers, killed, fireIdle } = idleHarness();

  const first = host.run(job("first"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  workers[0]?.complete();
  await expect(first).resolves.toBeNull();

  const second = host.run(job("second"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireIdle();
  expect(killed()).toEqual([]);
  expect(workers).toHaveLength(1);
  expect(workers[0]?.requests).toHaveLength(2);
  host.dispose();
  await expect(second).rejects.toThrow("Queue worker host stopped.");
});

it("runs jobs in this process when spawning a worker would crash", async () => {
  let spawned = 0;
  const requests: QueueWorkerRequest[] = [];
  const host = createQueueWorkerHost({
    spawn: () => {
      spawned += 1;
      throw new Error("should not spawn");
    },
    createJobId: () => "inline-job",
    validateSourcePath: async () => true,
    onStopped: () => {},
    execute: async (request) => {
      requests.push(request);
      return {
        ok: true,
        result: null,
        jobId: request.jobId,
        leaseToken: request.leaseToken,
        cancellationFence: request.cancellationFence,
      };
    },
  });

  await expect(host.run(job("inline"))).resolves.toBeNull();
  expect(spawned).toBe(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.jobId).toBe("inline-job");
  host.dispose();
});
