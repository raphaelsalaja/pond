import { describe, expect, it, vi } from "vitest";
import {
  createLocalRuntimeCoordinator,
  LocalRuntimeCoordinationError,
} from "./local-runtime-coordinator";

const runtime = {
  provider: "ollama" as const,
  baseUrl: "http://127.0.0.1:11434/v1",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("local runtime coordinator", () => {
  it("runs only one request at a time on the same local runtime", async () => {
    const coordinator = createLocalRuntimeCoordinator();
    const first = deferred<void>();
    const order: Array<string> = [];
    const firstRun = coordinator.run(
      {
        runtime,
        priority: "background",
        signal: new AbortController().signal,
        timeoutMs: 1000,
      },
      async () => {
        order.push("first-start");
        await first.promise;
        order.push("first-end");
      },
    );
    const secondRun = coordinator.run(
      {
        runtime,
        priority: "background",
        signal: new AbortController().signal,
        timeoutMs: 1000,
      },
      async () => {
        order.push("second");
      },
    );

    await vi.waitFor(() => expect(order).toEqual(["first-start"]));
    first.resolve();
    await Promise.all([firstRun, secondRun]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("runs queued interactive Assistant work before queued background media", async () => {
    const coordinator = createLocalRuntimeCoordinator();
    const active = deferred<void>();
    const order: Array<string> = [];
    const run = (
      name: string,
      priority: "interactive" | "background",
      operation: () => Promise<void> = async () => {},
    ) =>
      coordinator.run(
        {
          runtime,
          priority,
          signal: new AbortController().signal,
          timeoutMs: 1000,
        },
        async () => {
          order.push(name);
          await operation();
        },
      );

    const first = run("active-background", "background", () => active.promise);
    const background = run("queued-background", "background");
    const agent = run("interactive-agent", "interactive");
    await vi.waitFor(() => expect(order).toEqual(["active-background"]));
    active.resolve();
    await Promise.all([first, background, agent]);

    expect(order).toEqual([
      "active-background",
      "interactive-agent",
      "queued-background",
    ]);
  });

  it("removes an aborted request while it waits in the queue", async () => {
    const coordinator = createLocalRuntimeCoordinator();
    const active = deferred<void>();
    const waitingController = new AbortController();
    const waitingOperation = vi.fn(async () => {});
    const first = coordinator.run(
      {
        runtime,
        priority: "background",
        signal: new AbortController().signal,
        timeoutMs: 1000,
      },
      () => active.promise,
    );
    const waiting = coordinator.run(
      {
        runtime,
        priority: "background",
        signal: waitingController.signal,
        timeoutMs: 1000,
      },
      waitingOperation,
    );

    waitingController.abort();
    await expect(waiting).rejects.toEqual(
      new LocalRuntimeCoordinationError("aborted"),
    );
    active.resolve();
    await first;
    expect(waitingOperation).not.toHaveBeenCalled();
  });

  it("aborts executing work when its finite timeout expires", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createLocalRuntimeCoordinator();
      const observedAbort = vi.fn();
      const result = coordinator.run(
        {
          runtime,
          priority: "background",
          signal: new AbortController().signal,
          timeoutMs: 250,
        },
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                observedAbort();
                reject(new Error("transport stopped"));
              },
              { once: true },
            );
          }),
      );

      const timedOut = expect(result).rejects.toEqual(
        new LocalRuntimeCoordinationError("timeout"),
      );
      await vi.advanceTimersByTimeAsync(250);
      await timedOut;
      expect(observedAbort).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the first run as cold and later runs as warm", async () => {
    const coordinator = createLocalRuntimeCoordinator();
    const temperatures: Array<boolean> = [];
    for (let index = 0; index < 2; index += 1) {
      await coordinator.run(
        {
          runtime,
          priority: "background",
          signal: new AbortController().signal,
          timeoutMs: 1000,
        },
        async ({ cold }) => {
          temperatures.push(cold);
        },
      );
    }
    expect(temperatures).toEqual([true, false]);
  });
});
