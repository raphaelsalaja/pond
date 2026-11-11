import { app } from "electron";
import log from "electron-log/main.js";
import { getPrefs, invalidatePrefs } from "./core/prefs";
import { startHttpServer } from "./http/server";
import { setLinuxAutostart } from "./lib/linux-autostart";
import { createRuntimeControls } from "./runtime-controls";
import { setTrayVisible } from "./tray";
import { setCloseToTray } from "./window";

/** Windows and Linux have no wasOpenedAtLogin, so the login item passes this flag instead. */
export const LOGIN_LAUNCH_ARG = "--hidden";

export const runtimeControls = createRuntimeControls({
  getPrefs,
  invalidatePrefs,
  startHttpServer,
  setTrayVisible,
  isPackaged: app.isPackaged,
  setLoginItemSettings: async (settings) => {
    if (process.platform === "linux") {
      await setLinuxAutostart({
        enabled: settings.openAtLogin,
        /** An AppImage relaunches through its own file, not the temporary mount's binary. */
        execPath: process.env.APPIMAGE ?? process.execPath,
        args: [LOGIN_LAUNCH_ARG],
      });
      return;
    }
    app.setLoginItemSettings(
      process.platform === "win32"
        ? { ...settings, args: [LOGIN_LAUNCH_ARG] }
        : settings,
    );
  },
  setCloseToTray,
  async applyAppIcon(windowPrefs) {
    const { applyPreferredAppIcon } = await import("./core/app-icon");
    await applyPreferredAppIcon(windowPrefs);
  },
  warn: (message, error) => log.warn(message, error),
});
