import type {
  OkResult,
  ReasonFailure,
} from "../../shared/query-contracts-shared";
import type { UpdateNotice } from "../../shared/update-notice";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface UpdatePreferences {
  autoInstall: boolean;
}

export interface UpdaterPort {
  autoDownload(): boolean;
  setAutoDownload(value: boolean): void;
  setAutoInstallOnQuit(value: boolean): void;
  onAvailable(listener: (version: string) => void): void;
  onNotAvailable(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  onDownloaded(listener: (version: string) => void): void;
  check(): Promise<{ version?: string } | null>;
  download(): Promise<void>;
  /** May resolve before `quitAndInstall` runs, so the caller can reply first. */
  install(): void | Promise<void>;
}

export interface UpdaterDependencies {
  isPackaged(): boolean;
  loadUpdater(): Promise<UpdaterPort>;
  loadPreferences(): Promise<UpdatePreferences>;
  publish(notice: UpdateNotice): void;
  scheduleTimeout(callback: () => void, delay: number): void;
  scheduleInterval(callback: () => void, delay: number): void;
  info(message: string, value?: string): void;
  warn(message: string, error: Error): void;
}

function message(error: Error | null, fallback: string): string {
  return error?.message ?? fallback;
}

export function createUpdaterCoordinator(dependencies: UpdaterDependencies) {
  let latestNotice: UpdateNotice | null = null;

  function publish(notice: UpdateNotice): void {
    latestNotice = notice;
    dependencies.publish(notice);
  }

  async function applyPrefsTo(updater: UpdaterPort): Promise<void> {
    const { autoInstall } = await dependencies.loadPreferences();
    updater.setAutoDownload(autoInstall);
  }

  async function applyPrefs(): Promise<void> {
    if (!dependencies.isPackaged()) return;
    await applyPrefsTo(await dependencies.loadUpdater());
  }

  async function start(): Promise<void> {
    const updater = await dependencies.loadUpdater();
    updater.setAutoInstallOnQuit(true);
    try {
      await applyPrefsTo(updater);
    } catch (error) {
      updater.setAutoDownload(false);
      dependencies.warn(
        "[pond updater] prefs apply failed",
        error instanceof Error ? error : new Error("Unknown updater error"),
      );
    }

    updater.onAvailable((version) => {
      dependencies.info("[pond updater] update available", version);
      publish({
        phase: "available",
        version,
        downloading: updater.autoDownload(),
      });
    });
    updater.onNotAvailable(() => {
      latestNotice = null;
      dependencies.info("[pond updater] no update");
    });
    updater.onError((error) => {
      dependencies.warn("[pond updater] error", error);
    });
    updater.onDownloaded((version) => {
      dependencies.info("[pond updater] downloaded", version);
      publish({ phase: "downloaded", version });
    });

    dependencies.scheduleTimeout(() => {
      void updater.check().catch((error) => {
        dependencies.warn(
          "[pond updater] startup check failed",
          error instanceof Error ? error : new Error("Unknown updater error"),
        );
      });
    }, 2000);
    dependencies.scheduleInterval(() => {
      void updater.check().catch(() => {});
    }, SIX_HOURS_MS);
  }

  function currentNotice(): UpdateNotice | null {
    return latestNotice;
  }

  async function download(): Promise<OkResult | ReasonFailure<"dev_build">> {
    if (!dependencies.isPackaged()) return { ok: false, reason: "dev_build" };
    try {
      const updater = await dependencies.loadUpdater();
      await updater.download();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: message(
          error instanceof Error ? error : null,
          "Couldn't download the update.",
        ),
      };
    }
  }

  async function install(): Promise<OkResult | ReasonFailure<"dev_build">> {
    if (!dependencies.isPackaged()) return { ok: false, reason: "dev_build" };
    try {
      const updater = await dependencies.loadUpdater();
      await updater.install();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: message(
          error instanceof Error ? error : null,
          "Couldn't install the update.",
        ),
      };
    }
  }

  async function checkNow(): Promise<
    OkResult<{ version?: string }> | ReasonFailure<"dev_build">
  > {
    if (!dependencies.isPackaged()) return { ok: false, reason: "dev_build" };
    try {
      const updater = await dependencies.loadUpdater();
      const result = await updater.check();
      return { ok: true, version: result?.version };
    } catch (error) {
      return {
        ok: false,
        error: message(
          error instanceof Error ? error : null,
          "Couldn't check for updates.",
        ),
      };
    }
  }

  return {
    applyPrefs,
    checkNow,
    currentNotice,
    download,
    install,
    start,
  };
}
