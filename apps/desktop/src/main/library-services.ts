/** Background work bound to the open Library. Launch starts it once; a Library switch stops it and starts it again. */
import log from "electron-log/main.js";
import { registerSyncActionListener } from "./core/executor";
import { libraryRoot } from "./paths";

let generation = 0;
let stopDisplacementWatch: (() => void) | null = null;
let stopMediaWarmer: (() => void) | null = null;
let stopFingerprintWorker: (() => void) | null = null;
let fingerprintKickRegistered = false;

export function watchLibraryFolder(): void {
  const current = generation;
  void import("./core/library-displacement")
    .then((module) => {
      if (current !== generation) {
        return;
      }
      stopDisplacementWatch?.();
      stopDisplacementWatch = module.startLibraryDisplacementWatch();
    })
    .catch((error) =>
      log.warn("[pond] library displacement watch failed to start", error),
    );

  if (process.platform === "darwin" && !process.env.POND_SANDBOX) {
    void import("./core/library-folder-icon")
      .then((module) => module.applyLibraryFolderIcon(libraryRoot()))
      .catch((error) => log.warn("[pond] library folder icon failed", error));
  }
}

export async function startLibraryBackgroundWork(): Promise<void> {
  const current = generation;
  const live = () => current === generation;
  const [scanModule, mediaModule, enrichmentModule, fingerprintModule] =
    await Promise.all([
      import("./core/scan"),
      import("./core/media-warm/service"),
      import("./core/enrichment-sidecar"),
      import("./core/duplicates/fingerprint-worker"),
    ]);
  if (!live()) {
    return;
  }
  stopMediaWarmer = mediaModule.stopMediaWarmer;
  stopFingerprintWorker = fingerprintModule.stopFingerprintWorker;
  if (!fingerprintKickRegistered) {
    fingerprintKickRegistered = true;
    registerSyncActionListener(() => fingerprintModule.kickFingerprintWorker());
  }

  const step =
    (label: string, run: () => Promise<unknown>) => async (): Promise<void> => {
      if (!live()) {
        return;
      }
      await run().catch((error) => log.warn(`[pond] ${label} failed`, error));
    };

  void scanModule
    .reconcileLibrary()
    .catch((error) => log.warn("[pond] scan failed", error))
    .finally(() => {
      if (!live()) {
        return;
      }
      mediaModule.startMediaWarmer();
      void fingerprintModule
        .startFingerprintWorker()
        .catch((error) => log.warn("[pond] fingerprint worker failed", error));
    })
    .then(
      step("archive backfill", async () =>
        (
          await import("./core/refresh/archive-backfill")
        ).startArchiveBackfill(),
      ),
    )
    .then(
      step("native card backfill", async () =>
        (
          await import("./core/refresh/threads-card-backfill")
        ).startThreadsCardBackfill(),
      ),
    )
    .then(
      step("source icon backfill", async () =>
        (
          await import("./core/refresh/source-icon-backfill")
        ).backfillSourceIcons(),
      ),
    )
    .then(
      step("article backfill", async () =>
        (
          await import("./core/refresh/article-backfill")
        ).startArticleBackfill(),
      ),
    );
  void enrichmentModule
    .backfillEnrichmentSidecars()
    .catch((error) =>
      log.warn("[pond] enrichment sidecar backfill failed", error),
    );
}

export function stopLibraryBackgroundWork(): void {
  generation += 1;
  stopMediaWarmer?.();
  stopFingerprintWorker?.();
  stopDisplacementWatch?.();
  stopDisplacementWatch = null;
}
