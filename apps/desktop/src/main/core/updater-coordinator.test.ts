import { describe, expect, it, vi } from "vitest";
import type { UpdateNotice } from "../../shared/update-notice";
import { createUpdaterCoordinator } from "./updater-coordinator";
import type { UpdaterDependencies, UpdaterPort } from "./updater-coordinator";

interface UpdaterListeners {
  available?: (version: string) => void;
  notAvailable?: () => void;
  error?: (error: Error) => void;
  downloaded?: (version: string) => void;
  progress?: (percent: number) => void;
}

interface UpdaterControls {
  download: () => Promise<void>;
  install: () => void | Promise<void>;
}

function noop() {}

function setup() {
  const listeners: UpdaterListeners = {};
  const autoDownloads: Array<boolean> = [];
  const published: Array<UpdateNotice> = [];
  const calls = { checks: 0 };
  const controls: UpdaterControls = {
    download: async () => {},
    install: noop,
  };
  let autoDownload = false;
  const updater: UpdaterPort = {
    autoDownload: () => autoDownload,
    setAutoDownload: (value) => {
      autoDownloads.push(value);
      autoDownload = value;
    },
    setAutoInstallOnQuit: noop,
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
    onProgress: (listener) => {
      listeners.progress = listener;
    },
    check: async () => {
      calls.checks += 1;
      return { version: "2.0.0" };
    },
    download: () => controls.download(),
    install: () => controls.install(),
  };
  const dependencies: UpdaterDependencies = {
    isPackaged: () => true,
    loadUpdater: async () => updater,
    loadPreferences: async () => ({ autoInstall: false }),
    publish: (notice) => {
      published.push(notice);
    },
    scheduleTimeout: noop,
    scheduleInterval: noop,
    info: noop,
    warn: noop,
  };
  return {
    coordinator: createUpdaterCoordinator(dependencies),
    dependencies,
    listeners,
    controls,
    autoDownloads,
    published,
    calls,
  };
}

describe("updater coordinator", () => {
  it("applies automatic-download preferences", async () => {
    const { coordinator, dependencies, autoDownloads, calls } = setup();
    await coordinator.applyPrefs();
    expect(autoDownloads.at(-1)).toBe(false);

    dependencies.loadPreferences = async () => ({ autoInstall: true });
    await coordinator.applyPrefs();
    expect(autoDownloads.at(-1)).toBe(true);
    expect(calls.checks).toBe(0);
  });

  it("fails closed when update preferences cannot be read", async () => {
    const { coordinator, dependencies, listeners, autoDownloads, published } =
      setup();
    dependencies.loadPreferences = async () => {
      throw new Error("prefs unavailable");
    };
    await coordinator.start();

    expect(autoDownloads.at(-1)).toBe(false);
    listeners.available?.("1.2.0");
    expect(published).toContainEqual({
      phase: "available",
      version: "1.2.0",
      downloading: false,
    });
  });

  it("publishes available and downloaded notices and replays the latest", async () => {
    const { coordinator, listeners, published } = setup();
    await coordinator.start();

    listeners.available?.("1.2.0");
    expect(published).toContainEqual({
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

  it("publishes download progress in whole-percent steps", async () => {
    const { coordinator, listeners, published } = setup();
    await coordinator.start();
    listeners.available?.("1.2.0");
    const before = published.length;

    listeners.progress?.(41.2);
    listeners.progress?.(41.9);
    listeners.progress?.(42.1);

    expect(published.slice(before)).toHaveLength(2);
    expect(coordinator.currentNotice()).toEqual({
      phase: "available",
      version: "1.2.0",
      downloading: true,
      progress: 0.42,
    });
  });

  it("marks a requested download as running until it fails", async () => {
    const { coordinator, listeners, controls, published } = setup();
    await coordinator.start();
    listeners.available?.("1.2.0");
    let fail: (error: Error) => void = noop;
    controls.download = () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      });

    const pending = coordinator.download();
    await vi.waitFor(() =>
      expect(coordinator.currentNotice()).toEqual({
        phase: "available",
        version: "1.2.0",
        downloading: true,
      }),
    );

    fail(new Error("offline"));
    await expect(pending).resolves.toEqual({ ok: false, error: "offline" });
    expect(published.at(-1)).toEqual({
      phase: "available",
      version: "1.2.0",
      downloading: false,
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
    const { coordinator, controls } = setup();
    let release: () => void = noop;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    controls.install = () => gate;

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
    const { coordinator, controls } = setup();
    controls.download = async () => {
      throw new Error("download failed");
    };
    controls.install = () => {
      throw new Error("install failed");
    };

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
