import type { Source } from "@pond/schema/db";
import log from "electron-log/main.js";

export interface SyncStatusUpdate {
  accountId: string;
  source: Source;
  state: "idle" | "running" | "done" | "error" | "auth_required" | "paused";
  message?: string;
  progress?: { current: number; total: number };
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

const GAP_TEXT = new Map<string, string>([
  ["auth_required", "sign-in needed"],
  ["checkpoint", "confirmation needed"],
  ["rate_limited", "rate limited"],
  ["timeout", "timed out"],
  ["no_match", "not available"],
  ["fallback", "unavailable"],
  ["unknown", "failed"],
  ["page_error", "page error"],
]);

export function listGapNote(label: string, reason: string): string {
  return `${label} unavailable (${GAP_TEXT.get(reason) ?? reason}).`;
}

type StatusListener = (update: SyncStatusUpdate) => void;
const listeners = new Set<StatusListener>();

export function subscribeToSyncStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emit(update: SyncStatusUpdate): void {
  for (const cb of listeners) {
    try {
      cb(update);
    } catch (error) {
      log.warn("[pond sync] status listener threw", error);
    }
  }
}

export interface InFlight {
  controller: AbortController;
  startedAt: number;
  watchdog: ReturnType<typeof setTimeout>;
  source: Source;
}

export const inFlight = new Map<string, InFlight>();

export function isSyncing(accountId: string): boolean {
  return inFlight.has(accountId);
}

export function cancelAllSyncs(): void {
  for (const accountId of Array.from(inFlight.keys())) {
    cancelSync(accountId);
  }
}

export function cancelSync(accountId: string): void {
  const entry = inFlight.get(accountId);
  if (!entry) return;
  entry.controller.abort();
  emit({
    accountId,
    source: entry.source,
    state: "running",
    message: "Stopping",
  });
}
