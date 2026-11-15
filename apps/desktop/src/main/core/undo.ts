import { randomUUID } from "node:crypto";
import { inverse, type Transaction } from "@pond/schema/tx";
import type { UndoStepOutcome } from "@shared/wire";
import log from "electron-log/main.js";
import { executeBatch } from "./executor";

const MAX_HISTORY = 200;

interface UndoStep {
  id: string;
  transactions: Transaction[];
}

export function createUndoHistory(
  commit: (transactions: Transaction[]) => Promise<void>,
  createId: () => string = randomUUID,
) {
  const undoStack: UndoStep[] = [];
  const redoStack: UndoStep[] = [];
  let epoch = 0;
  let commandTail = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = commandTail.then(operation);
    commandTail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async function revert(step: UndoStep): Promise<boolean> {
    const started = epoch;
    try {
      await commit(
        [...step.transactions].reverse().map((item) => {
          const reverse = inverse(item);
          return {
            ...reverse,
            meta: { ...reverse.meta, actorReason: "undo" },
          };
        }),
      );
      if (epoch === started) redoStack.push(step);
      return true;
    } catch (error) {
      log.warn("[pond undo] failed", error);
      if (epoch === started) undoStack.push(step);
      return false;
    }
  }
  async function reapply(step: UndoStep): Promise<boolean> {
    const started = epoch;
    try {
      await commit(
        step.transactions.map((item) => ({
          ...item,
          meta: { ...item.meta, actorReason: "redo" },
        })),
      );
      if (epoch === started) undoStack.push(step);
      return true;
    } catch (error) {
      log.warn("[pond redo] failed", error);
      if (epoch === started) redoStack.push(step);
      return false;
    }
  }
  return {
    record(transactions: Transaction[]): string | null {
      if (!transactions.length) return null;
      const id = createId();
      undoStack.push({ id, transactions: structuredClone(transactions) });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      return id;
    },
    clear(): void {
      epoch++;
      undoStack.length = 0;
      redoStack.length = 0;
    },
    undo(): Promise<boolean> {
      return serialize(async () => {
        const step = undoStack.pop();
        return step ? revert(step) : false;
      });
    },
    redo(): Promise<boolean> {
      return serialize(async () => {
        const step = redoStack.pop();
        return step ? reapply(step) : false;
      });
    },
    /** Reverses one recorded step only while it is still the latest change; an already-undone step reports `done`. */
    undoStep(id: string): Promise<UndoStepOutcome> {
      return serialize(async () => {
        if (redoStack.at(-1)?.id === id) return "done";
        if (undoStack.at(-1)?.id !== id) return "stale";
        const step = undoStack.pop();
        if (!step) return "stale";
        return (await revert(step)) ? "done" : "failed";
      });
    },
    /** Reapplies one undone step only while it is still the latest undo; an already-redone step reports `done`. */
    redoStep(id: string): Promise<UndoStepOutcome> {
      return serialize(async () => {
        if (undoStack.at(-1)?.id === id) return "done";
        if (redoStack.at(-1)?.id !== id) return "stale";
        const step = redoStack.pop();
        if (!step) return "stale";
        return (await reapply(step)) ? "done" : "failed";
      });
    },
    canUndo(): boolean {
      return undoStack.length > 0;
    },
    canRedo(): boolean {
      return redoStack.length > 0;
    },
  };
}
const history = createUndoHistory(async (transactions) => {
  await executeBatch(transactions);
});
export function recordForUndo(transaction: Transaction): string | null {
  return history.record([transaction]);
}
export function recordBatchForUndo(transactions: Transaction[]): string | null {
  return history.record(transactions);
}
export const undo = history.undo;
export const redo = history.redo;
export const undoStep = history.undoStep;
export const redoStep = history.redoStep;
export const canUndo = history.canUndo;
export const canRedo = history.canRedo;

export const clearUndoHistory = history.clear;
