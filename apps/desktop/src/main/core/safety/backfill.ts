import type { NewSave, Save } from "@pond/schema/db";
import { saves as savesTable } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { and, asc, eq, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { executeTransaction } from "../executor";
import { classifySave } from "./nsfw";

export interface SafetyScanStatus {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  scored: number;
  skipped: number;
  startedAt: string | null;
  finishedAt: string | null;
  message?: string;
}

type StatusListener = (status: SafetyScanStatus) => void;
const listeners = new Set<StatusListener>();

let inFlight: AbortController | null = null;
let lastStatus: SafetyScanStatus = idleStatus();

function idleStatus(): SafetyScanStatus {
  return {
    state: "idle",
    total: 0,
    current: 0,
    scored: 0,
    skipped: 0,
    startedAt: null,
    finishedAt: null,
  };
}

function emit(next: SafetyScanStatus): void {
  lastStatus = next;
  for (const cb of listeners) {
    try {
      cb(next);
    } catch (err) {
      log.warn("[pond safety-scan] listener threw", err);
    }
  }
}

export function subscribeSafetyScanStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSafetyScanStatus(): SafetyScanStatus {
  return lastStatus;
}

export type SafetyScanStartResult =
  | { ok: true; total: number }
  | { ok: false; reason: "already_running" | "no_saves" };

export async function startSafetyScan(): Promise<SafetyScanStartResult> {
  if (inFlight) {
    return { ok: false as const, reason: "already_running" as const };
  }
  const ids = await pickUnscoredIds();
  if (ids.length === 0) {
    emit({
      ...idleStatus(),
      state: "done",
      finishedAt: new Date().toISOString(),
      message: "Every save is already scored.",
    });
    return { ok: false as const, reason: "no_saves" as const };
  }

  const controller = new AbortController();
  inFlight = controller;

  emit({
    state: "running",
    total: ids.length,
    current: 0,
    scored: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: `Scoring ${ids.length} save${ids.length === 1 ? "" : "s"}…`,
  });

  void runWorker(ids, controller.signal).finally(() => {
    inFlight = null;
  });

  return { ok: true as const, total: ids.length };
}

export function cancelSafetyScan(): void {
  if (!inFlight) return;
  inFlight.abort();
}

async function runWorker(ids: string[], signal: AbortSignal): Promise<void> {
  let scored = 0;
  let skipped = 0;
  let current = 0;

  for (const id of ids) {
    if (signal.aborted) break;
    const save = await loadSave(id);
    if (!save) {
      current += 1;
      skipped += 1;
      continue;
    }
    try {
      const result = await classifySave({ id: save.id, files: save.files });
      current += 1;
      if (!result) {
        skipped += 1;
      } else {
        await persistResult(save, result.score, result.label);
        scored += 1;
      }
    } catch (err) {
      log.warn("[pond safety-scan] classify failed", id, err);
      current += 1;
      skipped += 1;
    }
    emit({
      state: "running",
      total: ids.length,
      current,
      scored,
      skipped,
      startedAt: lastStatus.startedAt,
      finishedAt: null,
      message: `${current}/${ids.length} · ${scored} scored · ${skipped} skipped`,
    });
  }

  emit({
    state: signal.aborted ? "cancelled" : "done",
    total: ids.length,
    current,
    scored,
    skipped,
    startedAt: lastStatus.startedAt,
    finishedAt: new Date().toISOString(),
    message: signal.aborted
      ? `Cancelled at ${current}/${ids.length}.`
      : `Scored ${scored} save${scored === 1 ? "" : "s"} (${skipped} skipped).`,
  });
}

async function loadSave(id: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(savesTable)
    .where(and(eq(savesTable.id, id), isNull(savesTable.deletedAt)));
  return rows[0] ?? null;
}

async function persistResult(
  save: Save,
  score: number,
  label: NewSave["nsfwLabel"],
): Promise<void> {
  const patch: Partial<NewSave> = { nsfwScore: score, nsfwLabel: label };
  const tx: Transaction = {
    kind: "update",
    model: "save",
    id: save.id,
    patch,
    before: { nsfwScore: save.nsfwScore, nsfwLabel: save.nsfwLabel },
    meta: { actor: "ai", actorReason: "safety-scan" },
  };
  await executeTransaction(tx);
}

async function pickUnscoredIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: savesTable.id })
    .from(savesTable)
    .where(and(isNull(savesTable.nsfwScore), isNull(savesTable.deletedAt)))
    .orderBy(asc(savesTable.savedAt));
  return rows.map((r) => r.id);
}
