import type { Prefs, Source } from "@pond/schema/db";
import { SOURCES } from "@pond/schema/db";
import { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import { getPrefs } from "./prefs";
import { getStorageSnapshot } from "./storage-stats";
import { cancelSync } from "./sync";

export type StorageGuardAction = "warn" | "pauseSync" | "pauseVideo";
export type StorageGuardState = "ok" | "warn" | "exceeded";

export interface StorageGuardStatus {
  state: StorageGuardState;
  pondBytes: number;
  capBytes: number | null;
  warnBytes: number | null;
  action: StorageGuardAction;
  appliedAt: string;
}

let timer: NodeJS.Timeout | null = null;
let intervalMs: number | null = null;
let lastStatus: StorageGuardStatus = {
  state: "ok",
  pondBytes: 0,
  capBytes: null,
  warnBytes: null,
  action: "warn",
  appliedAt: new Date(0).toISOString(),
};

let syncBlocked = false;
let videoBlocked = false;

const GIB_BYTES = 1024 * 1024 * 1024;

export function isSyncBlockedByStorageGuard(): boolean {
  return syncBlocked;
}

export function isAutoVideoBlockedByStorageGuard(): boolean {
  return videoBlocked;
}

export function getStorageGuardState(): StorageGuardStatus {
  return lastStatus;
}

export async function startStorageWatcher(): Promise<void> {
  if (timer) return;
  await applyStorageWatcherPrefs();
}

export function stopStorageWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  intervalMs = null;
  syncBlocked = false;
  videoBlocked = false;
}

export async function applyStorageWatcherPrefs(): Promise<void> {
  let prefs: Prefs;
  try {
    prefs = await getPrefs();
  } catch (err) {
    log.warn("[pond storage-watcher] prefs read failed", err);
    return;
  }
  const cfg = prefs.storage;
  if (!cfg.guardsEnabled) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    intervalMs = null;
    if (syncBlocked || videoBlocked) {
      log.info("[pond storage-watcher] guards disabled, clearing flags");
      syncBlocked = false;
      videoBlocked = false;
    }
    lastStatus = {
      state: "ok",
      pondBytes: lastStatus.pondBytes,
      capBytes: null,
      warnBytes: null,
      action: cfg.action,
      appliedAt: new Date().toISOString(),
    };
    broadcast(lastStatus);
    return;
  }

  const minutes = clampInterval(cfg.watchIntervalMinutes);
  const nextMs = minutes * 60 * 1000;
  if (timer && intervalMs === nextMs) {
    void runTick();
    return;
  }
  if (timer) clearInterval(timer);
  intervalMs = nextMs;
  timer = setInterval(() => void runTick(), nextMs);
  void runTick();
}

function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return 5;
  return Math.max(1, Math.min(60, Math.floor(minutes)));
}

async function runTick(): Promise<void> {
  let prefs: Prefs;
  try {
    prefs = await getPrefs();
  } catch (err) {
    log.warn("[pond storage-watcher] tick prefs read failed", err);
    return;
  }
  const cfg = prefs.storage;
  if (!cfg.guardsEnabled) return;

  const someWindowVisible = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible(),
  );

  let snapshot: Awaited<ReturnType<typeof getStorageSnapshot>>;
  try {
    snapshot = await getStorageSnapshot();
  } catch (err) {
    log.warn("[pond storage-watcher] snapshot failed", err);
    return;
  }

  const cap =
    cfg.maxLibraryGb === null || cfg.maxLibraryGb === undefined
      ? null
      : Math.max(0, cfg.maxLibraryGb) * GIB_BYTES;
  const warnPct = Math.max(50, Math.min(100, cfg.warnAtPercent || 80));
  const warnBytes = cap === null ? null : (cap * warnPct) / 100;

  let next: StorageGuardState = "ok";
  if (cap !== null) {
    if (snapshot.pondBytes >= cap) next = "exceeded";
    else if (warnBytes !== null && snapshot.pondBytes >= warnBytes)
      next = "warn";
  }

  applyAction(next, cfg.action);

  lastStatus = {
    state: next,
    pondBytes: snapshot.pondBytes,
    capBytes: cap,
    warnBytes,
    action: cfg.action,
    appliedAt: new Date().toISOString(),
  };

  if (someWindowVisible) {
    broadcast(lastStatus);
  }
}

function applyAction(state: StorageGuardState, action: StorageGuardAction) {
  if (state !== "exceeded") {
    if (syncBlocked || videoBlocked) {
      log.info(
        `[pond storage-watcher] dropped below cap, clearing guard flags (state=${state})`,
      );
    }
    syncBlocked = false;
    videoBlocked = false;
    return;
  }
  if (action === "warn") {
    syncBlocked = false;
    videoBlocked = false;
    return;
  }
  if (action === "pauseSync") {
    if (!syncBlocked) {
      log.info("[pond storage-watcher] cap exceeded, pausing source syncs");
      for (const src of SOURCES as readonly Source[]) {
        try {
          cancelSync(src);
        } catch (err) {
          log.warn("[pond storage-watcher] cancelSync threw", src, err);
        }
      }
    }
    syncBlocked = true;
    videoBlocked = false;
    return;
  }
  if (action === "pauseVideo") {
    if (!videoBlocked) {
      log.info(
        "[pond storage-watcher] cap exceeded, pausing auto video downloads",
      );
    }
    syncBlocked = false;
    videoBlocked = true;
    return;
  }
}

function broadcast(status: StorageGuardStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.storageStatus, status);
    }
  }
}
