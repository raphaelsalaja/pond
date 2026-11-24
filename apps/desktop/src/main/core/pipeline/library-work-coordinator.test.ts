import { expect, it, vi } from "vitest";
import { createLibraryWorkCoordinator } from "./library-work-coordinator";
import type { LibraryWorkOperations } from "./library-work-coordinator";

function setup(wasPaused: boolean) {
  const order: Array<string> = [];
  const asyncStep = (name: string) =>
    vi.fn(async () => {
      order.push(name);
    });
  const syncStep = (name: string) =>
    vi.fn(() => {
      order.push(name);
    });
  const operations: LibraryWorkOperations = {
    stopAutoImport: asyncStep("stop-auto-import"),
    stopLibraryTransfers: asyncStep("stop-transfers"),
    pauseAndDrainReconciler: vi.fn(async () => {
      order.push("pause-and-drain");
      return wasPaused;
    }),
    interruptAndDrainReconciler: vi.fn(async () => {
      order.push("interrupt-and-drain");
      return wasPaused;
    }),
    suspendMutations: asyncStep("suspend-mutations"),
    resumeMutations: syncStep("resume-mutations"),
    resumeLibraryTransfers: syncStep("resume-transfers"),
    setReconcilerPaused: vi.fn(async () => {
      order.push("resume-reconciler");
      return false;
    }),
    startAutoImport: asyncStep("start-auto-import"),
    warn: vi.fn(),
  };
  return {
    coordinator: createLibraryWorkCoordinator(operations),
    operations,
    order,
  };
}

it("drains queue work before a Library switch and restores admission afterward", async () => {
  const { coordinator, operations, order } = setup(false);

  await coordinator.suspend();
  await coordinator.resume();

  expect(order).toEqual([
    "stop-auto-import",
    "stop-transfers",
    "pause-and-drain",
    "suspend-mutations",
    "resume-mutations",
    "resume-transfers",
    "resume-reconciler",
    "start-auto-import",
  ]);
  expect(operations.setReconcilerPaused).toHaveBeenCalledWith(false);
});

it("interrupts running downloads instead of waiting on them when asked", async () => {
  const { coordinator, operations, order } = setup(false);

  await coordinator.suspend("interrupt");
  await coordinator.resume();

  expect(order.slice(0, 4)).toEqual([
    "stop-auto-import",
    "stop-transfers",
    "interrupt-and-drain",
    "suspend-mutations",
  ]);
  expect(operations.pauseAndDrainReconciler).not.toHaveBeenCalled();
  expect(operations.setReconcilerPaused).toHaveBeenCalledWith(false);
});

it("preserves a queue that was already paused before a Library switch", async () => {
  const { coordinator, operations } = setup(true);

  await coordinator.suspend();
  await coordinator.resume();

  expect(operations.setReconcilerPaused).not.toHaveBeenCalled();
});
