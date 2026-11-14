import type { Save } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { desc, eq, sql } from "drizzle-orm";
import { powerMonitor } from "electron";
import log from "electron-log/main.js";
import type {
  MediaWarmFailure,
  MediaWarmSnapshot,
} from "../../../shared/library-health-contracts";
import type {
  MediaIndexPauseReason,
  MediaIndexStatus,
} from "../../../shared/media-index";
import { getDb } from "../../db";
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
let manual = false;
const failed = new Map<string, MediaWarmFailure>();
const active = new Map<string, MediaWarmCandidate>();
let thermal: ThermalState = "unknown";
let activeJobs = 0;
let scanCursor: { savedAt: number; id: string } | null = null;
let scanComplete = false;
let loadingPage = false;
let scanGeneration = 0;

function publish(patch: Partial<MediaIndexStatus>): void {
  const next = { ...status, ...patch };
  if (JSON.stringify(next) === JSON.stringify(status)) return;
  status = next;
}

async function startMediaIndex(): Promise<void> {
  scanGeneration += 1;
  manual = false;
  stopped = false;
  failed.clear();
  candidates = [];
  scanCursor = null;
  scanComplete = false;
  publish({
    state: "idle",
    prepared: 0,
    remaining: 0,
    currentTitle: null,
    pauseReason: null,
    lastError: null,
  });
  schedule(0);
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
  if (!scanComplete || candidates.length > 0) schedule(0);
}

function clearScheduled(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(delay: number): void {
  if (stopped || timer) return;
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
  if (stopped) return;
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
    const generation = scanGeneration;
    try {
      await loadCandidatePage(generation);
    } catch (err) {
      fail(err);
      return;
    } finally {
      loadingPage = false;
    }
    if (stopped) return;
    if (generation !== scanGeneration) {
      schedule(0);
      return;
    }
    if (candidates.length === 0 && !scanComplete) {
      schedule(0);
      return;
    }
  }

  if (candidates.length === 0) {
    if (activeJobs > 0) return;
    publish({
      state: failed.size > 0 ? "error" : "complete",
      currentTitle: null,
      pauseReason: null,
      remaining: failed.size,
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
    await attempt(candidate);
    publish({
      prepared: status.prepared + 1,
      remaining: Math.max(0, status.remaining - 1),
      currentTitle: activeJobs <= 1 ? null : status.currentTitle,
    });
  } catch (err) {
    publish({
      lastError: err instanceof Error ? err.message : String(err),
      remaining: Math.max(0, status.remaining - 1),
      currentTitle: activeJobs <= 1 ? null : status.currentTitle,
    });
  } finally {
    activeJobs -= 1;
  }
  schedule(0);
}

function failureKey(candidate: Pick<MediaWarmCandidate, "kind" | "saveId">) {
  return `${candidate.kind}:${candidate.saveId}`;
}

async function attempt(candidate: MediaWarmCandidate): Promise<void> {
  active.set(failureKey(candidate), candidate);
  try {
    await processCandidate(candidate);
    failed.delete(failureKey(candidate));
  } catch (err) {
    log.warn("[pond media-index] candidate failed", candidate.saveId, err);
    failed.set(failureKey(candidate), {
      saveId: candidate.saveId,
      title: candidate.title,
      kind: candidate.kind,
      error: err instanceof Error ? err.message : String(err),
      at: Date.now(),
    });
    throw err;
  } finally {
    active.delete(failureKey(candidate));
  }
}

export function mediaWarmSnapshot(): MediaWarmSnapshot {
  return {
    ...status,
    pendingPosters: candidates.filter((c) => c.kind === "poster").length,
    activeSaveIds: [...new Set([...active.values()].map((c) => c.saveId))],
    discovering: started && !scanComplete,
    failures: [...failed.values()].sort((a, b) => b.at - a.at),
  };
}

/** Runs outside idle-time pacing because it answers an explicit request. */
export async function retryMediaWarm(
  saveIds: readonly string[],
): Promise<number> {
  const queued: MediaWarmCandidate[] = [];
  for (const saveId of new Set(saveIds)) {
    const save = await readCandidateSave(saveId);
    if (!save) continue;
    for (const key of [...failed.keys()]) {
      if (failed.get(key)?.saveId === saveId) failed.delete(key);
    }
    candidates = candidates.filter((c) => c.saveId !== saveId);
    queued.push(...mediaWarmCandidates(save));
  }
  void (async () => {
    for (const candidate of queued) {
      await attempt(candidate).catch(() => {});
    }
    kick();
  })();
  return queued.length;
}

async function processCandidate(candidate: MediaWarmCandidate): Promise<void> {
  if (candidate.kind === "poster") {
    await runEnsurePoster(candidate.saveId);
    const refreshed = await readCandidateSave(candidate.saveId);
    if (!refreshed) return;
    const next = mediaWarmCandidates(refreshed);
    if (next.length > 0) {
      candidates.unshift(...next);
      publish({ remaining: status.remaining + next.length });
    }
    return;
  }
  const save = await readCandidateSave(candidate.saveId);
  if (!save) return;
  const { writeSaveBlurhash } = await import("../save-blurhash");
  await writeSaveBlurhash(save);
}

async function loadCandidatePage(generation: number): Promise<void> {
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
      source: saves.source,
      url: saves.url,
      blurhash: saves.blurhash,
      coverIndex: saves.coverIndex,
      savedAt: saves.savedAt,
    })
    .from(saves)
    .where(after)
    .orderBy(desc(saves.savedAt), desc(saves.id))
    .limit(SCAN_PAGE_SIZE + 1);
  if (generation !== scanGeneration) return;
  const page = rows.slice(0, SCAN_PAGE_SIZE);
  const last = page.at(-1);
  scanCursor = last
    ? { savedAt: last.savedAt.getTime(), id: last.id }
    : scanCursor;
  scanComplete = rows.length <= SCAN_PAGE_SIZE;
  const discovered = page.flatMap((save) => mediaWarmCandidates(save));
  candidates.push(...discovered);
  if (discovered.length > 0) {
    publish({ remaining: status.remaining + discovered.length });
  }
}

async function readCandidateSave(
  saveId: string,
): Promise<Pick<
  Save,
  | "id"
  | "title"
  | "status"
  | "files"
  | "source"
  | "url"
  | "blurhash"
  | "coverIndex"
> | null> {
  const db = await getDb();
  return (
    (await db
      .select({
        id: saves.id,
        title: saves.title,
        status: saves.status,
        files: saves.files,
        source: saves.source,
        url: saves.url,
        blurhash: saves.blurhash,
        coverIndex: saves.coverIndex,
      })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get()) ?? null
  );
}

function fail(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  log.warn("[pond media-index] failed to start", cause);
  publish({ state: "error", lastError: message, currentTitle: null });
}
