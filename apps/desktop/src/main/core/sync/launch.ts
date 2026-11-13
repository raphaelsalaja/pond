import type { Prefs } from "@pond/schema/db";
import { net } from "electron";
import log from "electron-log/main.js";
import { getPrefs } from "../prefs";
import { isSyncBlockedByStorageGuard } from "../storage-watcher";
import { syncAllSources } from ".";

interface LaunchSyncDeps {
  getPrefs: () => Promise<Prefs>;
  isOnline: () => boolean;
  isBlocked: () => boolean;
  syncAll: () => Promise<void>;
}

const liveDeps: LaunchSyncDeps = {
  getPrefs,
  isOnline: () => net.isOnline(),
  isBlocked: isSyncBlockedByStorageGuard,
  syncAll: () => syncAllSources({ trigger: "launch" }),
};

export type LaunchSyncResult =
  | "disabled"
  | "offline"
  | "storage_blocked"
  | "started";

/** Runs once during main-process initialization, never when a renderer window reopens. */
export async function startLaunchSync(
  deps: LaunchSyncDeps = liveDeps,
): Promise<LaunchSyncResult> {
  const prefs = await deps.getPrefs();
  if (!prefs.sync.launch) return "disabled";
  if (deps.isBlocked()) return "storage_blocked";
  if (!deps.isOnline()) return "offline";
  void deps
    .syncAll()
    .catch((error) => log.warn("[pond launch-sync] global sync failed", error));
  return "started";
}
