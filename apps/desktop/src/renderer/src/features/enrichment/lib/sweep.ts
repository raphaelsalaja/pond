import { isManualSensitiveDecision } from "@pond/schema/content-safety";
import {
  enrichmentCooldownFactor,
  enrichmentRestMs,
  enrichmentSuspended,
} from "@shared/machine-pace";
import pLimit from "p-limit";
import { enrichmentMonitor } from "@/features/enrichment/state/enrichment-monitor";
import { onPoolDirty, pool, upsertSave } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import {
  readMachinePace,
  retainMachinePace,
  subscribeMachinePace,
} from "@/shared/lib/machine-pace";
import { getPrefsSnapshot, subscribePrefsSnapshot } from "@/shared/state/prefs";
import { releaseIdleInferenceWorker } from "./inference-client";
import { ENRICHERS, ENRICHERS_BY_ID } from "./registry";
import type { Enricher } from "./types";

type PrefsSnapshot = ReturnType<typeof getPrefsSnapshot>;

export function createEnrichmentPreferenceAccess(
  getPrefs: () => PrefsSnapshot,
) {
  return {
    eligible(enricher: Enricher, save: Save, prefs = getPrefs()): boolean {
      return enricher.eligible(save, prefs?.ai);
    },
    run(enricher: Enricher, save: Save) {
      return enricher.run(save, getPrefs()?.ai);
    },
  };
}

function mediaUnderstandingPreferenceKey(prefs: PrefsSnapshot): string {
  return JSON.stringify(prefs?.ai ?? null);
}

export function subscribeMediaUnderstandingRefresh(dependencies: {
  getPrefs: () => PrefsSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
}): () => void {
  let preferenceKey = mediaUnderstandingPreferenceKey(dependencies.getPrefs());
  return dependencies.subscribe(() => {
    const nextKey = mediaUnderstandingPreferenceKey(dependencies.getPrefs());
    if (nextKey === preferenceKey) return;
    preferenceKey = nextKey;
    dependencies.refresh();
  });
}

const enrichmentPreferenceAccess =
  createEnrichmentPreferenceAccess(getPrefsSnapshot);

/** Models are CPU/GPU heavy and share the UI renderer; one-at-a-time keeps the sweep from starving interactive work. */
const limit = pLimit(1);
const inflight = new Set<string>();
const failed = new Set<string>();

function suspended(): boolean {
  return enrichmentSuspended(readMachinePace(), Date.now());
}

const stats = {
  done: 0,
  totalMs: 0,
  byEnricher: new Map<string, { done: number; ms: number }>(),
};

function recordRun(enricher: Enricher, ms: number): void {
  stats.done += 1;
  stats.totalMs += ms;
  const e = stats.byEnricher.get(enricher.id) ?? { done: 0, ms: 0 };
  e.done += 1;
  e.ms += ms;
  stats.byEnricher.set(enricher.id, e);
  if (stats.done % 10 === 0) {
    const avg = Math.round(stats.totalMs / stats.done);
    console.info(
      `[enrichment] progress done=${stats.done} inflight=${inflight.size} avg=${avg}ms ` +
        `last=${enricher.id} (${Math.round(ms)}ms)`,
    );
  }
}

function publishActivity(): void {
  enrichmentMonitor.set({
    inflight: inflight.size,
    activeKeys: new Set(inflight),
    failedKeys: new Set(failed),
  });
}

function keyFor(enricher: Enricher, save: Save): string {
  return `${enricher.id}:${save.id}`;
}

/**
 * Rest between runs so the CPU/GPU returns to idle instead of pinning at ~100% for the whole backlog; requestIdleCallback fires immediately on an idle machine, so heavy runs would otherwise go back-to-back.
 * @remarks Rest is ~50% of the run's own duration, clamped so quick runs still pause and long runs don't stall the backlog. Battery, a background window, and fair heat stretch that rest.
 */
function cooldown(lastRunMs: number): Promise<void> {
  if (suspended()) return Promise.resolve();
  const ms = enrichmentRestMs(
    lastRunMs,
    enrichmentCooldownFactor(readMachinePace()),
  );
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (globalThis.requestIdleCallback) {
      globalThis.requestIdleCallback(() => resolve(), { timeout });
    } else setTimeout(resolve, 0);
  });
}

function dependenciesSatisfied(
  enricher: Enricher,
  save: Save,
  prefs: ReturnType<typeof getPrefsSnapshot>,
): boolean {
  if (!enricher.dependsOn) return true;
  for (const depId of enricher.dependsOn) {
    const dep = ENRICHERS_BY_ID.get(depId);
    if (!dep) continue;
    if (
      dep.enabled(prefs) &&
      enrichmentPreferenceAccess.eligible(dep, save, prefs)
    )
      return false;
  }
  return true;
}

async function persist(enricher: Enricher, save: Save): Promise<void> {
  const result = await enrichmentPreferenceAccess.run(enricher, save);
  if (result == null) {
    failed.add(keyFor(enricher, save));
    return;
  }
  const current = pool.get(save.id);
  /** Classification may still be running when the user corrects the Save. */
  if (
    enricher.id === "sensitive-content" &&
    isManualSensitiveDecision(current?.sensitiveModel)
  ) {
    return;
  }
  if (result.optimistic) {
    if (current) upsertSave({ ...current, ...result.optimistic });
  }
  if (result.derived && Object.keys(result.derived).length > 0) {
    try {
      await window.pond.query("saves.patchDerived", {
        id: save.id,
        patch: result.derived,
      });
    } catch (err) {
      console.warn(`[enrichment] persist failed (${enricher.id})`, err);
    }
  }
}

function schedule(enricher: Enricher, save: Save): void {
  if (suspended()) return;
  const key = keyFor(enricher, save);
  if (inflight.has(key) || failed.has(key)) return;
  inflight.add(key);
  publishActivity();
  void limit(async () => {
    await whenIdle();
    const current = pool.get(save.id);
    const prefs = getPrefsSnapshot();
    if (
      suspended() ||
      !current ||
      !enricher.enabled(prefs) ||
      !enrichmentPreferenceAccess.eligible(enricher, current, prefs) ||
      !dependenciesSatisfied(enricher, current, prefs)
    ) {
      inflight.delete(key);
      publishActivity();
      return;
    }
    const startedAt = performance.now();
    let elapsed = 0;
    try {
      await persist(enricher, current);
    } catch (err) {
      failed.add(key);
      console.warn(`[enrichment] ${enricher.id} failed for ${save.id}`, err);
    } finally {
      elapsed = performance.now() - startedAt;
      recordRun(enricher, elapsed);
      inflight.delete(key);
      publishActivity();
    }
    await cooldown(elapsed);
  });
}

let mutationGeneration = 0;
let lastFullScanGeneration = -1;

function scan(ids?: readonly string[]): void {
  if (suspended()) return;
  const prefs = getPrefsSnapshot();
  const scope = ids && ids.length > 0 ? new Set(ids) : null;
  const saves = [...pool.snapshot()]
    .filter((s) => !scope || scope.has(s.id))
    .sort((a, b) => b.savedAt - a.savedAt);
  const backlog: string[] = [];
  for (const enricher of ENRICHERS) {
    if (!enricher.enabled(prefs)) continue;
    let eligible = 0;
    for (const save of saves) {
      if (!enrichmentPreferenceAccess.eligible(enricher, save, prefs)) continue;
      eligible += 1;
      if (!dependenciesSatisfied(enricher, save, prefs)) continue;
      schedule(enricher, save);
    }
    if (eligible > 0) backlog.push(`${enricher.id}=${eligible}`);
  }
  if (backlog.length > 0) {
    console.info(
      `[enrichment] scan backlog ${backlog.join(" ")} (inflight=${inflight.size})`,
    );
  }
  if (!scope) lastFullScanGeneration = mutationGeneration;
}

let sweepStarted = false;
let scanScheduled = false;
let pendingScope: Set<string> | null = null;
const FULL_SCAN_MS = 15 * 60_000;

function scheduleScan(ids?: readonly string[]): void {
  const scoped = ids && ids.length > 0 ? ids : null;
  if (scanScheduled) {
    if (!scoped) pendingScope = null;
    else if (pendingScope !== null)
      for (const id of scoped) pendingScope.add(id);
    return;
  }
  scanScheduled = true;
  pendingScope = scoped ? new Set(scoped) : null;
  setTimeout(() => {
    void whenIdle().then(() => {
      scanScheduled = false;
      const scope = pendingScope ? [...pendingScope] : undefined;
      pendingScope = null;
      scan(scope);
    });
  }, 250);
}

export function rescanEnrichment(ids?: readonly string[]): void {
  if (ids && ids.length > 0) {
    const scope = new Set(ids);
    for (const key of failed) {
      if (scope.has(key.slice(key.indexOf(":") + 1))) failed.delete(key);
    }
    publishActivity();
    scheduleScan(ids);
    return;
  }
  failed.clear();
  publishActivity();
  scheduleScan();
}

export function startEnrichmentSweep(): () => void {
  if (sweepStarted) return () => {};
  sweepStarted = true;
  const hydrations = ENRICHERS.flatMap((e) =>
    e.hydrate
      ? [
          e.hydrate().catch((err) => {
            console.warn(`[enrichment] hydrate failed (${e.id})`, err);
          }),
        ]
      : [],
  );
  void Promise.all(hydrations).then(() => scheduleScan());
  const detachPrefs = subscribeMediaUnderstandingRefresh({
    getPrefs: getPrefsSnapshot,
    subscribe: subscribePrefsSnapshot,
    refresh: () => rescanEnrichment(),
  });
  const detachDirty = onPoolDirty((ids) => {
    mutationGeneration += 1;
    scheduleScan(ids);
  });
  const fullScanTimer = setInterval(() => {
    if (lastFullScanGeneration !== mutationGeneration) scheduleScan();
  }, FULL_SCAN_MS);

  let wasSuspended = suspended();
  const detachPace = subscribeMachinePace(() => {
    const next = suspended();
    if (next) releaseIdleInferenceWorker();
    if (wasSuspended && !next) scheduleScan();
    wasSuspended = next;
  });
  const releasePace = retainMachinePace();

  return () => {
    detachDirty();
    detachPrefs();
    clearInterval(fullScanTimer);
    detachPace();
    releasePace();
  };
}
