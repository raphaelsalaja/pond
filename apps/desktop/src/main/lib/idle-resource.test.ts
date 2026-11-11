import { describe, expect, it } from "vitest";
import { createIdleResource } from "./idle-resource";

function harness(options: { failLoad?: boolean } = {}) {
  const timers: Array<{ run: () => void; cancelled: boolean }> = [];
  let loads = 0;
  let disposals = 0;
  const resource = createIdleResource({
    load: async () => {
      loads += 1;
      if (options.failLoad) throw new Error("load failed");
      return {
        id: loads,
        dispose: () => {
          disposals += 1;
        },
      };
    },
    idleMs: 1_000,
    schedule: (run) => {
      const timer = { run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const fireIdle = async () => {
    for (const timer of timers.splice(0)) {
      if (!timer.cancelled) timer.run();
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    resource,
    fireIdle,
    loads: () => loads,
    disposals: () => disposals,
  };
}

describe("createIdleResource", () => {
  it("loads once and reuses the value across uses", async () => {
    const h = harness();
    const first = await h.resource.use(async (value) => value.id);
    const second = await h.resource.use(async (value) => value.id);
    expect([first, second]).toEqual([1, 1]);
    expect(h.loads()).toBe(1);
  });

  it("disposes after the idle period and reloads on the next use", async () => {
    const h = harness();
    await h.resource.use(async () => undefined);
    await h.fireIdle();
    expect(h.disposals()).toBe(1);
    const id = await h.resource.use(async (value) => value.id);
    expect(id).toBe(2);
    expect(h.loads()).toBe(2);
  });

  it("keeps the value while a use is still running", async () => {
    const h = harness();
    let finish: () => void = () => undefined;
    const slow = h.resource.use(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await h.resource.use(async () => undefined);
    await h.fireIdle();
    expect(h.disposals()).toBe(0);
    finish();
    await slow;
    await h.fireIdle();
    expect(h.disposals()).toBe(1);
  });

  it("cancels a pending disposal when used again", async () => {
    const h = harness();
    await h.resource.use(async () => undefined);
    await h.resource.use(async () => undefined);
    await h.fireIdle();
    expect(h.disposals()).toBe(1);
    expect(h.loads()).toBe(1);
  });

  it("retries the load after a failure", async () => {
    const h = harness({ failLoad: true });
    await expect(h.resource.use(async () => undefined)).rejects.toThrow(
      "load failed",
    );
    await expect(h.resource.use(async () => undefined)).rejects.toThrow(
      "load failed",
    );
    expect(h.loads()).toBe(2);
    await h.fireIdle();
    expect(h.disposals()).toBe(0);
  });

  it("releases on demand when idle", async () => {
    const h = harness();
    await h.resource.use(async () => undefined);
    await h.resource.release();
    expect(h.disposals()).toBe(1);
    await h.fireIdle();
    expect(h.disposals()).toBe(1);
  });
});
