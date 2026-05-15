import { inverse, type Transaction } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { executeTransaction } from "./executor";

const MAX_HISTORY = 200;

const undoStack: Transaction[] = [];
const redoStack: Transaction[] = [];

export function recordForUndo(tx: Transaction): void {
  undoStack.push(tx);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

export async function undo(): Promise<boolean> {
  const tx = undoStack.pop();
  if (!tx) return false;
  try {
    const reverse = inverse(tx);
    await executeTransaction({
      ...reverse,
      meta: { ...(reverse.meta ?? {}), actorReason: "undo" },
    });
    redoStack.push(tx);
    return true;
  } catch (err) {
    log.warn("[pond undo] failed", err);
    undoStack.push(tx);
    return false;
  }
}

export async function redo(): Promise<boolean> {
  const tx = redoStack.pop();
  if (!tx) return false;
  try {
    await executeTransaction({
      ...tx,
      meta: { ...(tx.meta ?? {}), actorReason: "redo" },
    });
    undoStack.push(tx);
    return true;
  } catch (err) {
    log.warn("[pond redo] failed", err);
    redoStack.push(tx);
    return false;
  }
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}
