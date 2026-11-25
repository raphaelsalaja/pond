import type { WireSyncAction } from "@shared/wire";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSyncRefetch } from "./sync-refetch";

function syncStream() {
  const listeners = new Set<(action: WireSyncAction) => void>();
  return {
    subscribe(listener: (action: WireSyncAction) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(modelName: WireSyncAction["modelName"]) {
      const action: WireSyncAction = {
        id: 1,
        batchId: null,
        modelName,
        modelId: "id",
        action: "U",
        data: null,
        prevData: null,
        actor: "system",
        actorReason: null,
        createdAt: 0,
      };
      for (const listener of listeners) listener(action);
    },
    get size() {
      return listeners.size;
    },
  };
}

function noop() {}

function counter(body: () => Promise<void> = async () => {}) {
  const run = async () => {
    run.calls += 1;
    await body();
  };
  run.calls = 0;
  return run;
}

function deferred() {
  let resolve = noop;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("onSyncRefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gathers a burst of actions into one refetch", async () => {
    const stream = syncStream();
    const run = counter();
    onSyncRefetch({
      models: ["save"],
      delayMs: 100,
      run,
      subscribe: stream.subscribe,
    });
    for (let i = 0; i < 50; i += 1) stream.emit("save");
    await vi.advanceTimersByTimeAsync(100);
    expect(run.calls).toBe(1);
  });

  it("ignores actions on other models", async () => {
    const stream = syncStream();
    const run = counter();
    onSyncRefetch({
      models: ["save"],
      delayMs: 100,
      run,
      subscribe: stream.subscribe,
    });
    stream.emit("tag");
    stream.emit("settings");
    await vi.advanceTimersByTimeAsync(500);
    expect(run.calls).toBe(0);
  });

  it("never overlaps refetches and runs once more after a busy one", async () => {
    const stream = syncStream();
    const gates: Array<ReturnType<typeof deferred>> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const run = counter(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      inFlight -= 1;
    });
    onSyncRefetch({
      models: ["save"],
      delayMs: 100,
      run,
      subscribe: stream.subscribe,
    });
    stream.emit("save");
    await vi.advanceTimersByTimeAsync(100);
    expect(run.calls).toBe(1);
    for (let i = 0; i < 20; i += 1) {
      stream.emit("save");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(run.calls).toBe(1);
    gates[0]?.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(run.calls).toBe(2);
    gates[1]?.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.calls).toBe(2);
    expect(maxInFlight).toBe(1);
  });

  it("keeps refetching after a failed run", async () => {
    const stream = syncStream();
    const run = counter(async () => {
      throw new Error("offline");
    });
    onSyncRefetch({
      models: ["save"],
      delayMs: 100,
      run,
      subscribe: stream.subscribe,
    });
    stream.emit("save");
    await vi.advanceTimersByTimeAsync(100);
    stream.emit("save");
    await vi.advanceTimersByTimeAsync(100);
    expect(run.calls).toBe(2);
  });

  it("stops listening and drops a pending refetch", async () => {
    const stream = syncStream();
    const run = counter();
    const stop = onSyncRefetch({
      models: ["save"],
      delayMs: 100,
      run,
      subscribe: stream.subscribe,
    });
    stream.emit("save");
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.calls).toBe(0);
    expect(stream.size).toBe(0);
  });
});
