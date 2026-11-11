import { DEFAULT_PREFS, type Prefs } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { createRuntimeControls } from "./runtime-controls";

function setup(isPackaged = false) {
  const events: string[] = [];
  let prefs = structuredClone(DEFAULT_PREFS);
  let readError: Error | null = null;
  let closeError: Error | null = null;
  const controls = createRuntimeControls({
    async getPrefs() {
      events.push("read");
      if (readError) throw readError;
      return prefs;
    },
    invalidatePrefs() {
      events.push("invalidate");
    },
    async startHttpServer(port, bind) {
      events.push(`start:${port}:${bind}`);
      return {
        port,
        host: bind === "lan" ? "0.0.0.0" : "127.0.0.1",
        async close() {
          events.push("close");
          if (closeError) throw closeError;
        },
      };
    },
    async setTrayVisible(visible) {
      events.push(`tray:${visible}`);
    },
    isPackaged,
    async setLoginItemSettings(settings) {
      events.push(`login:${settings.openAtLogin}`);
    },
    setCloseToTray(enabled) {
      events.push(`close-to-tray:${enabled}`);
    },
    async applyAppIcon(windowPrefs) {
      events.push(`icon:${windowPrefs.appIcon}`);
    },
    warn() {
      events.push("warning");
    },
  });
  return {
    controls,
    events,
    setPrefs(next: Prefs) {
      prefs = next;
    },
    failRead() {
      readError = new Error("unavailable preferences");
    },
    failClose() {
      closeError = new Error("close failed");
    },
  };
}

describe("runtime controls", () => {
  it("restarts with refreshed preferences after closing the current server", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.setPrefs({
      ...DEFAULT_PREFS,
      api: { ...DEFAULT_PREFS.api, port: 4567, bindAddress: "lan" },
    });
    await expect(run.controls.restartHttpServer()).resolves.toEqual({
      port: 4567,
      host: "0.0.0.0",
    });
    expect(run.events).toEqual([
      "invalidate",
      "read",
      "close",
      "start:4567:lan",
    ]);
    await run.controls.closeHttpServer();
    expect(run.events.at(-1)).toBe("close");
  });

  it("keeps the current server running when preferences cannot be read", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.failRead();
    await expect(run.controls.restartHttpServer()).rejects.toThrow(
      "unavailable preferences",
    );
    expect(run.events).toEqual(["invalidate", "read"]);
  });

  it("still attempts restart when closing the old server fails", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.failClose();
    await run.controls.restartHttpServer();
    expect(run.events.slice(0, 4)).toEqual([
      "invalidate",
      "read",
      "close",
      "warning",
    ]);
    expect(run.events.at(-1)).toMatch(/^start:/);
  });

  it.each([false, true])(
    "applies runtime preferences with packaged=%s",
    async (packaged) => {
      const run = setup(packaged);
      await run.controls.applyPrefsAtRuntime();
      expect(run.events).toEqual([
        "invalidate",
        "read",
        `tray:${DEFAULT_PREFS.quickCapture.menuBarIcon}`,
        ...(packaged
          ? [`login:${DEFAULT_PREFS.quickCapture.launchAtLogin}`]
          : []),
        `close-to-tray:${DEFAULT_PREFS.window.closeToTray === true}`,
        `icon:${DEFAULT_PREFS.window.appIcon}`,
      ]);
    },
  );

  it("applies window preferences without applying unrelated runtime settings", async () => {
    const run = setup();
    await run.controls.applyWindowPrefsAtRuntime();
    expect(run.events).toEqual([
      "invalidate",
      "read",
      `close-to-tray:${DEFAULT_PREFS.window.closeToTray === true}`,
    ]);
  });
});
