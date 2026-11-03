import { describe, expect, it, vi } from "vitest";
import {
  createUpdaterCoordinator,
  type UpdaterDependencies,
  type UpdaterPort,
} from "./updater-coordinator";

interface UpdaterListeners {
  available?: (version: string) => void;
  notAvailable?: () => void;
  error?: (error: Error) => void;
  downloaded?: (version: string) => void;
}

function setup() {
  const listeners: UpdaterListeners = {};
  let autoDownload = false;
  const updater: UpdaterPort = {
    autoDownload: () => autoDownload,
    setAutoDownload: vi.fn((value) => {
      autoDownload = value;
    }),
    setAutoInstallOnQuit: vi.fn(),
    onAvailable: (listener) => {
      listeners.available = listener;
    },
    onNotAvailable: (listener) => {
      listeners.notAvailable = listener;
    },
    onError: (listener) => {
      listeners.error = listener;
    },
    onDownloaded: (listener) => {
      listeners.downloaded = listener;
    },
    check: vi.fn().mockResolvedValue({ version: "2.0.0" }),
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn(),
  };
  const dependencies: UpdaterDependencies = {
    isPackaged: () => true,
    loadUpdater: async () => updater,
    loadPreferences: async () => ({ autoInstall: false }),
    publish: vi.fn(),
    scheduleTimeout: vi.fn(),
    scheduleInterval: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  return {
    coordinator: createUpdaterCoordinator(dependencies),
    dependencies,
    listeners,
    updater,
  };
}

describe("updater coordinator", () => {
  it("applies automatic-download preferences", async () => {
    const { coordinator, dependencies, updater } = setup();
    await coordinator.applyPrefs();
    expect(updater.setAutoDownload).toHaveBeenLastCalledWith(false);

    dependencies.loadPreferences = async () => ({ autoInstall: true });
    await coordinator.applyPrefs();
    expect(updater.setAutoDownload).toHaveBeenLastCalledWith(true);
    expect(updater.check).not.toHaveBeenCalled();
  });

  it("fails closed when update preferences cannot be read", async () => {
    const { coordinator, dependencies, listeners, updater } = setup();
    dependencies.loadPreferences = async () => {
      throw new Error("prefs unavailable");
    };
    await coordinator.start();

    expect(updater.setAutoDownload).toHaveBeenLastCalledWith(false);
    listeners.available?.("1.2.0");
    expect(dependencies.publish).toHaveBeenCalledWith({
      phase: "available",
      version: "1.2.0",
      downloading: false,
    });
  });

  it("publishes available and downloaded notices and replays the latest", async () => {
    const { coordinator, dependencies, listeners } = setup();
    await coordinator.start();

    listeners.available?.("1.2.0");
    expect(dependencies.publish).toHaveBeenCalledWith({
      phase: "available",
      version: "1.2.0",
      downloading: false,
    });
    expect(coordinator.currentNotice()).toEqual({
      phase: "available",
      version: "1.2.0",
      downloading: false,
    });

    listeners.downloaded?.("1.2.0");
    expect(coordinator.currentNotice()).toEqual({
      phase: "downloaded",
      version: "1.2.0",
    });
  });

  it("clears replay state when no update is available", async () => {
    const { coordinator, listeners } = setup();
    await coordinator.start();
    listeners.available?.("1.2.0");
    listeners.notAvailable?.();

    expect(coordinator.currentNotice()).toBeNull();
  });

  it("reports install success only after the handoff releases the caller", async () => {
    const { coordinator, updater } = setup();
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(updater.install).mockImplementationOnce(() => gate);

    let settled = false;
    const pending = coordinator.install().then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("returns download and install failures to callers", async () => {
    const { coordinator, updater } = setup();
    vi.mocked(updater.download).mockRejectedValueOnce(
      new Error("download failed"),
    );
    vi.mocked(updater.install).mockImplementationOnce(() => {
      throw new Error("install failed");
    });

    await expect(coordinator.download()).resolves.toEqual({
      ok: false,
      error: "download failed",
    });
    await expect(coordinator.install()).resolves.toEqual({
      ok: false,
      error: "install failed",
    });
  });

  it("keeps packaged-only operations unavailable in development", async () => {
    const { dependencies } = setup();
    dependencies.isPackaged = () => false;
    const coordinator = createUpdaterCoordinator(dependencies);

    await expect(coordinator.checkNow()).resolves.toEqual({
      ok: false,
      reason: "dev_build",
    });
    await expect(coordinator.download()).resolves.toEqual({
      ok: false,
      reason: "dev_build",
    });
    await expect(coordinator.install()).resolves.toEqual({
      ok: false,
      reason: "dev_build",
    });
  });
});
