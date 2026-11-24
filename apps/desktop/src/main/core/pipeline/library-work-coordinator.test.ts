import { expect, it } from "vitest";
import { createLibraryWorkCoordinator } from "./library-work-coordinator";
import type { LibraryWorkOperations } from "./library-work-coordinator";

function setup(wasPaused: boolean) {
  const order: Array<string> = [];
  const reconcilerPausedCalls: Array<boolean> = [];
  const asyncStep = (name: string) => async () => {
    order.push(name);
  };
  const syncStep = (name: string) => () => {
    order.push(name);
  };
  const operations: LibraryWorkOperations = {
    stopAutoImport: asyncStep("stop-auto-import"),
    stopLibraryTransfers: asyncStep("stop-transfers"),
    pauseAndDrainReconciler: async () => {
      order.push("pause-and-drain");
      return wasPaused;
    },
    interruptAndDrainReconciler: async () => {
      order.push("interrupt-and-drain");
      return wasPaused;
    },
    suspendMutations: asyncStep("suspend-mutations"),
    resumeMutations: syncStep("resume-mutations"),
    resumeLibraryTransfers: syncStep("resume-transfers"),
    setReconcilerPaused: async (paused) => {
      order.push("resume-reconciler");
      reconcilerPausedCalls.push(paused);
      return false;
    },
    startAutoImport: asyncStep("start-auto-import"),
    warn: () => {},
  };
  return {
    coordinator: createLibraryWorkCoordinator(operations),
    order,
    reconcilerPausedCalls,
  };
}

it("drains queue work before a Library switch and restores admission afterward", async () => {
  const { coordinator, order, reconcilerPausedCalls } = setup(false);

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
  expect(reconcilerPausedCalls).toEqual([false]);
});

it("interrupts running downloads instead of waiting on them when asked", async () => {
  const { coordinator, order, reconcilerPausedCalls } = setup(false);

  await coordinator.suspend("interrupt");
  await coordinator.resume();

  expect(order.slice(0, 4)).toEqual([
    "stop-auto-import",
    "stop-transfers",
    "interrupt-and-drain",
    "suspend-mutations",
  ]);
  expect(order).not.toContain("pause-and-drain");
  expect(reconcilerPausedCalls).toEqual([false]);
});

it("preserves a queue that was already paused before a Library switch", async () => {
  const { coordinator, reconcilerPausedCalls } = setup(true);

  await coordinator.suspend();
  await coordinator.resume();

  expect(reconcilerPausedCalls).toEqual([]);
});
