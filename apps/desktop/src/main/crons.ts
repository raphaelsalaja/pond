import { net } from "electron";
import log from "electron-log/main.js";
import { isSyncScheduleDue } from "../shared/sync-schedule";
import { emptyTrashOlderThan } from "./core/library-ops";
import { getPrefs } from "./core/prefs";
import { maybeUpdateYtDlp, recoverYtDlp } from "./core/refresh/yt-dlp-updater";
import { isSyncBlockedByStorageGuard } from "./core/storage-watcher";
import { syncAllSources } from "./core/sync";
import { schedule } from "./lib/scheduler";

export function registerTrashCron() {
  schedule({
    name: "trash",
    every: 60 * 60 * 1000,
    initialDelay: 30_000,
    fn: async () => {
      const prefs = await getPrefs();
      const days = prefs.trash.autoEmptyDays;
      if (days === null) return;
      const purged = await emptyTrashOlderThan(days);
      if (purged > 0) {
        log.info(
          `[pond trash-cron] purged ${purged} items older than ${days}d`,
        );
      }
    },
  });
}

export function registerYtDlpUpdateCron() {
  // Restoring a binary left broken by an interrupted update must not wait for
  // the first scheduled check.
  void recoverYtDlp();
  schedule({
    name: "yt-dlp-update",
    every: 24 * 60 * 60 * 1000,
    initialDelay: 5_000,
    fn: () => maybeUpdateYtDlp(),
  });
}

let lastSyncCronRunAt = 0;
const SYNC_CRON_JITTER_MS = 10 * 60_000;
const CRON_BATCH_LIMIT = 150;

export function registerSyncCron() {
  let running = false;
  let calendarSince = Date.now();
  let calendarRule: string | undefined;
  schedule({
    name: "sync-all",
    every: 60_000,
    initialDelay: 60_000,
    fn: async () => {
      if (running) return;
      running = true;
      try {
        const prefs = await getPrefs();
        const cron = prefs.sync.cron;
        const rule = JSON.stringify({
          enabled: cron.enabled,
          calendar: cron.calendar,
          recurrence: cron.recurrence,
        });
        if (calendarRule !== undefined && calendarRule !== rule)
          calendarSince = Date.now();
        calendarRule = rule;
        if (!cron.enabled) return;
        if (isSyncBlockedByStorageGuard()) {
          log.info("[pond sync-cron] storage guard active, skipping");
          return;
        }
        if (!net.isOnline()) {
          log.info("[pond sync-cron] offline, skipping");
          return;
        }
        if (
          !isSyncScheduleDue(cron, new Date(), lastSyncCronRunAt, calendarSince)
        )
          return;
        if (!cron.calendar && !cron.recurrence) {
          const jitter = Math.floor(Math.random() * SYNC_CRON_JITTER_MS);
          await new Promise((resolve) => setTimeout(resolve, jitter));
        }
        const latest = (await getPrefs()).sync.cron;
        if (JSON.stringify(latest) !== JSON.stringify(cron)) return;
        if (!net.isOnline() || isSyncBlockedByStorageGuard()) return;

        lastSyncCronRunAt = Date.now();
        log.info("[pond sync-cron] starting background sync", {
          intervalHours: cron.intervalHours,
        });
        await syncAllSources({ trigger: "cron", maxItems: CRON_BATCH_LIMIT });
      } finally {
        running = false;
      }
    },
  });
}
