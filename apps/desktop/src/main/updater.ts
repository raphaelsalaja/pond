import { app, dialog } from "electron";
import log from "electron-log/main.js";
import electronUpdaterPkg from "electron-updater";
import { getPrefs } from "./core/prefs";

const { autoUpdater } = electronUpdaterPkg;

/**
 * Auto-updater. Follows electron-updater's GitHub releases provider —
 * `electron-builder.yml` already has `publish: github`. We:
 *
 *  - Check on startup (2 seconds after ready to avoid fighting the first
 *    frame render).
 *  - Re-check every 6 hours when idle.
 *  - Prompt the user with a native dialog before installing.
 *
 * Development builds short-circuit via `app.isPackaged`. The updater is
 * tolerant of network failures; a offline laptop just never sees
 * upgrades.
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let wired = false;

export function registerAutoUpdater() {
  if (wired) return;
  if (!app.isPackaged) {
    log.info("[pond updater] skipped (dev build)");
    return;
  }
  wired = true;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Honour the persisted prefs at boot. Subsequent flips from the
  // settings page route through `applyUpdaterPrefs` below.
  void applyUpdaterPrefs().catch((err) =>
    log.warn("[pond updater] prefs apply failed", err),
  );

  autoUpdater.on("update-available", (info) => {
    log.info("[pond updater] update available", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    log.info("[pond updater] no update");
  });

  autoUpdater.on("error", (err) => {
    log.warn("[pond updater] error", err);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log.info("[pond updater] downloaded", info.version);
    const res = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart & install", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "pond update ready",
      message: `pond ${info.version} has been downloaded.`,
      detail: "Restart to apply the update.",
    });
    if (res.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      log.warn("[pond updater] startup check failed", err);
    });
  }, 2000);

  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {
      /* polled failures are non-fatal; logged by the handler above */
    });
  }, SIX_HOURS_MS);
}

/**
 * Apply the persisted updater prefs to the live `autoUpdater`
 * instance. Channel = "stable" | "beta" routes the user to the
 * matching electron-updater channel; auto-install toggles
 * `autoDownload`. Safe to call from non-packaged builds — early
 * returns when the updater isn't wired.
 */
export async function applyUpdaterPrefs(): Promise<void> {
  if (!app.isPackaged) return;
  const prefs = await getPrefs();
  autoUpdater.allowPrerelease = prefs.updates.channel === "beta";
  autoUpdater.channel = prefs.updates.channel;
  autoUpdater.autoDownload = prefs.updates.autoInstall;
}

/** Manual "Check for updates" button. */
export async function checkForUpdatesNow(): Promise<{
  ok: boolean;
  version?: string;
  reason?: string;
}> {
  if (!app.isPackaged) {
    return { ok: false, reason: "dev_build" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      version: result?.updateInfo?.version,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}
