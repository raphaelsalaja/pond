import { setTimeout as sleep } from "node:timers/promises";
import type { JsonObject } from "@pond/schema/json";
import type { BrowserWindow } from "electron";
import log from "electron-log/main.js";

/** CDP commands can hang indefinitely on a wedged hidden window; bound them so a stuck capture can't hold its window lease and starve the pool. */
const CDP_COMMAND_TIMEOUT_MS = 10_000;

async function sendCdpCommand(
  dbg: Electron.Debugger,
  method: string,
  params: JsonObject | undefined,
  timeoutMs: number,
): Promise<void> {
  await Promise.race([
    params === undefined
      ? dbg.sendCommand(method)
      : dbg.sendCommand(method, params),
    sleep(timeoutMs).then(() => {
      throw new Error(`CDP ${method} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

export async function emulateColorScheme(
  win: BrowserWindow,
  scheme: "light" | "dark",
): Promise<() => Promise<void>> {
  const dbg = win.webContents.debugger;
  const alreadyAttached = dbg.isAttached();
  let attachedHere = false;
  try {
    if (!alreadyAttached) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    await sendCdpCommand(
      dbg,
      "Emulation.setEmulatedMedia",
      { features: [{ name: "prefers-color-scheme", value: scheme }] },
      CDP_COMMAND_TIMEOUT_MS,
    );
  } catch (error) {
    log.warn(
      "[pond screenshot:tweet] emulated media setup failed",
      scheme,
      error,
    );
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /** A debugger that failed to set up may already be detached. */
      }
    }
    return async () => {};
  }
  return async () => {
    try {
      await sendCdpCommand(
        dbg,
        "Emulation.setEmulatedMedia",
        { features: [] },
        CDP_COMMAND_TIMEOUT_MS,
      );
    } catch {
      /** The window may be gone; the emulation dies with it. */
    }
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /** The window may be gone, which detaches the debugger. */
      }
    }
  };
}

export async function withDeviceScaleFactor<T>(
  win: BrowserWindow,
  factor: number,
  fn: () => Promise<T>,
): Promise<T> {
  const dbg = win.webContents.debugger;
  const alreadyAttached = dbg.isAttached();
  let attachedHere = false;
  try {
    if (!alreadyAttached) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    const [width, height] = win.getContentSize();
    await sendCdpCommand(
      dbg,
      "Emulation.setDeviceMetricsOverride",
      {
        width: width ?? 1280,
        height: height ?? 1024,
        deviceScaleFactor: factor,
        mobile: false,
      },
      CDP_COMMAND_TIMEOUT_MS,
    );
    return await fn();
  } finally {
    try {
      await sendCdpCommand(
        dbg,
        "Emulation.clearDeviceMetricsOverride",
        undefined,
        CDP_COMMAND_TIMEOUT_MS,
      );
    } catch {
      /** The window may be gone; the override dies with it. */
    }
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /** The window may be gone, which detaches the debugger. */
      }
    }
  }
}
