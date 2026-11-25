import type Database from "better-sqlite3";
import { powerMonitor } from "electron";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { saveFile } from "../../paths";
import { mediaWarmPauseReason } from "../media-warm/policy";
import type { ThermalState } from "../media-warm/policy";
import { binariesAvailable } from "../refresh/binaries";
import { runFingerprintBatch } from "./fingerprint-batch";
import { computeFingerprint } from "./fingerprint-compute";
import {
  clearUnavailableFingerprints,
  deleteOrphanFingerprints,
} from "./fingerprints";

const PAUSE_POLL_MS = 5000;
const BATCH_GAP_MS = 250;
const KICK_DELAY_MS = 2000;

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let thermal: ThermalState = "unknown";
let swept = false;
let rerun = false;

function schedule(delay: number): void {
  if (!started || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, delay);
  timer.unref?.();
}

function onThermalStateChange(event: { state: ThermalState }): void {
  thermal = event.state;
  kickFingerprintWorker();
}

/** Same gate as media warming: never on battery, never while hot, and only once the user has been idle for a moment. */
function paused(): boolean {
  return (
    mediaWarmPauseReason({
      idleSeconds: powerMonitor.getSystemIdleTime(),
      onBattery: powerMonitor.isOnBatteryPower(),
      thermal,
      manual: false,
    }) !== null
  );
}

function ingestRunning(sqlite: Database.Database): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM tasks WHERE status = 'running' LIMIT 1")
      .get() !== undefined
  );
}

async function tick(): Promise<void> {
  if (!started) return;
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  rerun = false;
  try {
    const db = await getDb();
    const sqlite = db.$raw;
    if (paused() || ingestRunning(sqlite)) {
      schedule(PAUSE_POLL_MS);
      return;
    }
    const result = await runFingerprintBatch(sqlite, {
      resolvePath: saveFile,
      compute: computeFingerprint,
      shouldStop: () => !started || paused(),
    });
    if (result.state === "idle") {
      if (!swept) {
        swept = true;
        deleteOrphanFingerprints(sqlite);
      }
      return;
    }
    schedule(result.state === "stopped" ? PAUSE_POLL_MS : BATCH_GAP_MS);
  } catch (error) {
    log.warn("[pond duplicates] fingerprint batch failed", error);
    schedule(PAUSE_POLL_MS);
  } finally {
    running = false;
    if (rerun) schedule(BATCH_GAP_MS);
  }
}

/** Called on every Library change; the worker wakes, drains what is new, and goes back to sleep. */
export function kickFingerprintWorker(): void {
  swept = false;
  schedule(KICK_DELAY_MS);
}

export async function startFingerprintWorker(): Promise<void> {
  if (started) return;
  started = true;
  thermal =
    process.platform === "darwin"
      ? powerMonitor.getCurrentThermalState()
      : "unknown";
  powerMonitor.on("on-ac", kickFingerprintWorker);
  powerMonitor.on("resume", kickFingerprintWorker);
  if (process.platform === "darwin") {
    powerMonitor.on("thermal-state-change", onThermalStateChange);
  }
  if (binariesAvailable().ffmpeg) {
    const db = await getDb();
    clearUnavailableFingerprints(db.$raw);
  }
  schedule(KICK_DELAY_MS);
}

export function stopFingerprintWorker(): void {
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  powerMonitor.off("on-ac", kickFingerprintWorker);
  powerMonitor.off("resume", kickFingerprintWorker);
  if (process.platform === "darwin") {
    powerMonitor.off("thermal-state-change", onThermalStateChange);
  }
}
