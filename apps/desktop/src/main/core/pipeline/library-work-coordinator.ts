export interface LibraryWorkOperations {
  stopAutoImport: () => Promise<void>;
  stopLibraryTransfers: () => Promise<void>;
  pauseAndDrainReconciler: () => Promise<boolean>;
  interruptAndDrainReconciler: () => Promise<boolean>;
  suspendMutations: () => Promise<void>;
  resumeMutations: () => void;
  resumeLibraryTransfers: () => void;
  setReconcilerPaused: (paused: boolean) => Promise<boolean>;
  startAutoImport: () => Promise<void>;
  warn: (message: string, error: Error) => void;
}

/** `drain` lets running downloads finish; `interrupt` puts them back in the queue so a switch never waits on one. */
export type LibraryWorkSuspension = "drain" | "interrupt";

export function createLibraryWorkCoordinator(ops: LibraryWorkOperations) {
  let reconcilerWasPaused: boolean | null = null;

  return {
    async suspend(mode: LibraryWorkSuspension = "drain"): Promise<void> {
      await ops.stopAutoImport();
      await ops.stopLibraryTransfers();
      if (reconcilerWasPaused === null) {
        reconcilerWasPaused =
          mode === "interrupt"
            ? await ops.interruptAndDrainReconciler()
            : await ops.pauseAndDrainReconciler();
      }
      await ops.suspendMutations();
    },

    async resume(): Promise<void> {
      ops.resumeMutations();
      ops.resumeLibraryTransfers();
      const wasPaused = reconcilerWasPaused;
      reconcilerWasPaused = null;
      if (wasPaused === false) await ops.setReconcilerPaused(false);
      await ops
        .startAutoImport()
        .catch((cause: unknown) =>
          ops.warn(
            "Could not start auto-import",
            cause instanceof Error ? cause : new Error(String(cause)),
          ),
        );
    },
  };
}
