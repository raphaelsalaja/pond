import log from "electron-log/main.js";
import type { PipelineSnapshot } from "./reconciler";

function importReconciler() {
  return import("./reconciler");
}

let reconcilerPromise: ReturnType<typeof importReconciler> | null = null;

function loadReconciler(): ReturnType<typeof importReconciler> {
  reconcilerPromise ??= importReconciler();
  return reconcilerPromise;
}

function reportLoadFailure(error: Error): void {
  log.error("[pipeline] failed to load reconciler", error);
}

export function startReconciler(): void {
  void loadReconciler()
    .then((reconciler) => reconciler.startReconciler())
    .catch(reportLoadFailure);
}

export function kickReconciler(): void {
  void loadReconciler()
    .then((reconciler) => reconciler.kickReconciler())
    .catch(reportLoadFailure);
}

export async function setReconcilerPaused(paused: boolean): Promise<boolean> {
  const reconciler = await loadReconciler();
  if (paused) {
    reconciler.pauseReconciler();
  } else {
    reconciler.resumeReconciler();
  }
  return reconciler.isReconcilerPaused();
}

export async function cancelSaveIngest(saveId: string): Promise<boolean> {
  return (await loadReconciler()).cancelSaveIngest(saveId);
}

export async function cancelSavesIngest(
  saveIds: ReadonlyArray<string>,
): Promise<number> {
  return (await loadReconciler()).cancelSavesIngest(saveIds);
}

export async function cancelAllIngest(): Promise<number> {
  return (await loadReconciler()).cancelAllIngest();
}

export async function cancelGeneration(generationId: string): Promise<number> {
  return (await loadReconciler()).cancelGeneration(generationId);
}

export async function skipSaves(ids: ReadonlyArray<string>): Promise<number> {
  return (await loadReconciler()).skipSaves(ids);
}

export async function pipelineSnapshot(): Promise<PipelineSnapshot> {
  return (await loadReconciler()).pipelineSnapshot();
}

export async function pauseAndDrainReconciler(
  timeoutMs?: number,
): Promise<boolean> {
  return (await loadReconciler()).pauseAndDrainReconciler(timeoutMs);
}

export async function interruptAndDrainReconciler(
  timeoutMs?: number,
): Promise<boolean> {
  return (await loadReconciler()).interruptAndDrainReconciler(timeoutMs);
}

export async function reinitializeReconciler(): Promise<void> {
  await (await loadReconciler()).reinitializeReconciler();
}

export async function suspendReconciler(): Promise<void> {
  await (await loadReconciler()).suspendReconciler();
}

export async function resumeReconcilerAfterSuspend(): Promise<void> {
  await (await loadReconciler()).resumeReconcilerAfterSuspend();
}
