import type { Save } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { desc, eq, sql } from "drizzle-orm";
import { BrowserWindow, powerMonitor } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../../shared/constants";
import type {
  MediaIndexPauseReason,
  MediaIndexStatus,
} from "../../../shared/media-index";
import { CARD_INDEX_WIDTHS } from "../../../shared/media-index";
import { getDb } from "../../db";
import { prepareThumbnails } from "../../lib/thumbnail";
import { itemFile } from "../../paths";
import { runEnsurePoster } from "../pipeline/workers/ensure-poster";
import { type MediaWarmCandidate, mediaWarmCandidates } from "./candidates";
import { mediaWarmPauseReason, type ThermalState } from "./policy";

const PAUSE_POLL_MS = 1_000;
const MAX_INFLIGHT = 2;
const SCAN_PAGE_SIZE = 100;
const initialStatus: MediaIndexStatus = {
  state: "idle",
  prepared: 0,
  remaining: 0,
  currentTitle: null,
  pauseReason: null,
  lastError: null,
};

let status = initialStatus;
let candidates: MediaWarmCandidate[] = [];
let timer: NodeJS.Timeout | null = null;
let started = false;
let stopped = false;
let userPaused = false;
let manual = false;
let failures = 0;
let thermal: ThermalState = "unknown";
let activeJobs = 0;
let scanCursor: { savedAt: Date; id: string } | null = null;
let scanComplete = false;
let loadingPage = false;

function publish(patch: Partial<MediaIndexStatus>): void {
  const next = { ...status, ...patch };
  if (JSON.stringify(next) === JSON.stringify(status)) return;
  status = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.mediaIndexStatus, status);
  }
}

export function getMediaIndexStatus(): MediaIndexStatus {
  return status;
}

export async function startMediaIndex(opts?: {
  manual?: boolean;
}): Promise<MediaIndexStatus> {
  manual = opts?.manual === true;
  userPaused = false;
  stopped = false;
  failures = 0;
  candidates = [];
  scanCursor = null;
  scanComplete = false;
  loadingPage = false;
  publish({
    state: "idle",
    prepared: 0,
    remaining: 0,
    currentTitle: null,
    pauseReason: null,
    lastError: null,
  });
  schedule(0);
  return status;
}

export function pauseMediaIndex(): MediaIndexStatus {
  userPaused = true;
  clearScheduled();
  publish({
    state: "paused-user",
    currentTitle: null,
    pauseReason: null,
  });
  return status;
}

export function resumeMediaIndex(): MediaIndexStatus {
  userPaused = false;
  manual = true;
  publish({ state: "idle", pauseReason: null, lastError: null });
  schedule(0);
  return status;
}

export function startMediaWarmer(): void {
  if (started) return;
  started = true;
  stopped = false;
  thermal = currentThermalState();
  powerMonitor.on("on-ac", kick);
  powerMonitor.on("on-battery", kick);
  powerMonitor.on("resume", kick);
  if (process.platform === "darwin") {
    powerMonitor.on("thermal-state-change", onThermalStateChange);
  }
  void startMediaIndex().catch((err) => fail(err));
}

export function stopMediaWarmer(): void {
  stopped = true;
  started = false;
  clearScheduled();
  powerMonitor.off("on-ac", kick);
  powerMonitor.off("on-battery", kick);
  powerMonitor.off("resume", kick);
  if (process.platform === "darwin") {
    powerMonitor.off("thermal-state-change", onThermalStateChange);
  }
}

function onThermalStateChange(event: { state: ThermalState }): void {
  thermal = event.state;
  kick();
}

function currentThermalState(): ThermalState {
  if (process.platform !== "darwin") return "unknown";
  return powerMonitor.getCurrentThermalState();
}

function kick(): void {
  if (!userPaused && (!scanComplete || candidates.length > 0)) schedule(0);
}

function clearScheduled(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(delay: number): void {
  if (stopped || userPaused || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, delay);
  timer.unref?.();
}

function systemPauseReason(): MediaIndexPauseReason | null {
  return mediaWarmPauseReason({
    idleSeconds: powerMonitor.getSystemIdleTime(),
    onBattery: powerMonitor.isOnBatteryPower(),
    thermal,
    manual,
  });
}

async function tick(): Promise<void> {
  if (stopped || userPaused) return;
  const reason = systemPauseReason();
  if (reason) {
    publish({
      state: "paused-system",
      currentTitle: null,
      pauseReason: reason,
    });
    schedule(PAUSE_POLL_MS);
    return;
  }

  if (candidates.length === 0 && !scanComplete) {
    if (loadingPage) return;
    loadingPage = true;
    try {
      await loadCandidatePage();
    } catch (err) {
      fail(err);
      return;
    } finally {
      loadingPage = false;
    }
    if (stopped || userPaused) return;
    /** A page can contain only text saves; continue scanning without retaining their JSON. */
    if (candidates.length === 0 && !scanComplete) {
      schedule(0);
      return;
    }
  }

  if (candidates.length === 0) {
    if (activeJobs > 0) return;
    publish({
      state: failures > 0 ? "error" : "complete",
      currentTitle: null,
      pauseReason: null,
      remaining: failures,
    });
    return;
  }

  while (activeJobs < MAX_INFLIGHT) {
    const candidate = candidates.shift();
    if (!candidate) break;
    activeJobs += 1;
    void processOne(candidate);
  }
}

async function processOne(candidate: MediaWarmCandidate): Promise<void> {
  publish({
    state: "indexing",
    currentTitle: candidate.title,
    pauseReason: null,
  });
  try {
    await processCandidate(candidate);
    publish({
      prepared: status.prepared + 1,
      remaining: Math.max(0, status.remaining - 1),
      currentTitle: activeJobs <= 1 ? null : status.currentTitle,
    });
  } catch (err) {
    failures += 1;
    const message = err instanceof Error ? err.message : String(err);
    log.warn("[pond media-index] candidate failed", candidate.saveId, err);
    publish({
      lastError: message,
      currentTitle: activeJobs <= 1 ? null : status.currentTitle,
    });
  } finally {
    activeJobs -= 1;
  }
  schedule(0);
}

async function processCandidate(candidate: MediaWarmCandidate): Promise<void> {
  if (candidate.kind === "poster") {
    await runEnsurePoster(candidate.saveId);
    const refreshed = await readCandidateSave(candidate.saveId);
    if (!refreshed) return;
    const next = mediaWarmCandidates(refreshed).filter(
      (item): item is Extract<MediaWarmCandidate, { kind: "thumbnail" }> =>
        item.kind === "thumbnail",
    );
    if (next.length > 0) {
      candidates.unshift(...next);
      publish({ remaining: status.remaining + next.length });
    }
    return;
  }
  await warmThumbnail(candidate);
}

async function warmThumbnail(
  candidate: Extract<MediaWarmCandidate, { kind: "thumbnail" }>,
): Promise<void> {
  const sourcePath = itemFile(candidate.saveId, candidate.sourceFile);
  await prepareThumbnails({
    saveId: candidate.saveId,
    sourcePath,
    widths: CARD_INDEX_WIDTHS,
    version: candidate.version,
    priority: "background",
  });
}

async function loadCandidatePage(): Promise<void> {
  const db = await getDb();
  const after = scanCursor
    ? sql`(${saves.savedAt}, ${saves.id}) < (${scanCursor.savedAt}, ${scanCursor.id})`
    : undefined;
  const rows = await db
    .select({
      id: saves.id,
      title: saves.title,
      status: saves.status,
      files: saves.files,
      savedAt: saves.savedAt,
    })
    .from(saves)
    .where(after)
    .orderBy(desc(saves.savedAt), desc(saves.id))
    .limit(SCAN_PAGE_SIZE + 1);
  const page = rows.slice(0, SCAN_PAGE_SIZE);
  const last = page.at(-1);
  scanCursor = last ? { savedAt: last.savedAt, id: last.id } : scanCursor;
  scanComplete = rows.length <= SCAN_PAGE_SIZE;
  const discovered = page.flatMap((save) => mediaWarmCandidates(save));
  candidates.push(...discovered);
  if (discovered.length > 0) {
    publish({ remaining: status.remaining + discovered.length });
  }
}

async function readCandidateSave(
  saveId: string,
): Promise<Pick<Save, "id" | "title" | "status" | "files"> | null> {
  const db = await getDb();
  return (
    (await db
      .select({
        id: saves.id,
        title: saves.title,
        status: saves.status,
        files: saves.files,
      })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get()) ?? null
  );
}

function fail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  log.warn("[pond media-index] failed to start", err);
  publish({ state: "error", lastError: message, currentTitle: null });
}
