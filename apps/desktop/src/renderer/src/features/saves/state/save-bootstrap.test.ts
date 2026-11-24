import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavePatchSchema } from "../lib/reconcile";
import { pool } from "./pool";
import { createSaveBootstrap } from "./save-bootstrap";
import type { SaveBootstrapDependencies } from "./save-bootstrap";

beforeEach(() => {
  pool.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  pool.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function services(): SaveBootstrapDependencies {
  return {
    readSnapshot: async () => [],
    scheduleSnapshotWrite() {},
    applyActionCoalesced() {},
    rendererReady() {},
    onSyncAction() {},
    loadAll: async () => [],
    loadPage: async () => ({ rows: [], nextCursor: null, total: 0 }),
  };
}

it("unblocks the window when cache and initial page stalls, then accepts the late page", async () => {
  const snapshot = Promise.withResolvers<[]>();
  const page =
    Promise.withResolvers<
      Awaited<ReturnType<SaveBootstrapDependencies["loadPage"]>>
    >();
  const ready = vi.fn();
  const subscribe = vi.fn();
  const boot = createSaveBootstrap({
    ...services(),
    readSnapshot: () => snapshot.promise,
    loadPage: () => page.promise,
    rendererReady: ready,
    onSyncAction: subscribe,
  });
  const first = boot.bootPool();
  expect(boot.bootPool()).toBe(first);
  await vi.advanceTimersByTimeAsync(6000);
  await first;
  expect(ready).toHaveBeenCalledOnce();
  expect(subscribe).toHaveBeenCalledOnce();
  expect(boot.pagingStore.state.ready).toBe(true);
  page.resolve({
    rows: [SavePatchSchema.parse({ id: "late", url: "https://example.com" })],
    total: 1,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(pool.get("late")?.url).toBe("https://example.com");
  expect(boot.pagingStore.state).toMatchObject({
    loading: false,
    loaded: 1,
    hasMore: false,
  });
  snapshot.resolve([]);
});

it("keeps independent paging state for each bootstrap instance", async () => {
  const first = createSaveBootstrap(services());
  const second = createSaveBootstrap(services());
  await first.bootPool();
  expect(first.pagingStore.state.ready).toBe(true);
  expect(second.pagingStore.state.ready).toBe(false);
});
